import aiohttp
import asyncio
import sqlite3
import time
import re
from datetime import datetime
from vkbottle import Keyboard, KeyboardButtonColor, Text, Callback, GroupEventType, BaseStateGroup
from vkbottle.bot import Bot, Message, MessageEvent

# --- ВЗЛОМ СИСТЕМЫ: Отключаем проверку SSL для VK API ---
orig_init = aiohttp.TCPConnector.__init__
def patched_init(self, *args, **kwargs):
    kwargs['ssl'] = False
    orig_init(self, *args, **kwargs)
aiohttp.TCPConnector.__init__ = patched_init
# --------------------------------------------------------

# --- НАСТРОЙКИ ---
TOKEN = "vk1.a.7a7xgL0pVgzKS1jx179sJRmuO6HrbUxNYEcKrHMjUNlpfX63kzPULki1GCFf9a8yLdozvL1pWygBDLAAWu_otWLIEBSmXqQHAIhDvfb3i1cWir4j2SNH8fkHIlZe1lBp4N9CCaS6RU0VK7I4VyRCfPb9BzY7GSWVhjz9zazpnulzUbbOcqO4Y7SfPVJTrJTmn-Vj3L6nIMNWmjEUKoymmw"
ADMINS = [510619275, 764850264]

bot = Bot(token=TOKEN)

# --- БАЗА ДАННЫХ ---
def init_db():
    conn = sqlite3.connect("svahuilsk_vk.db")
    cursor = conn.cursor()
    cursor.execute('''CREATE TABLE IF NOT EXISTS citizens (user_id INTEGER PRIMARY KEY, name TEXT)''')
    cursor.execute('''CREATE TABLE IF NOT EXISTS passport_fields (user_id INTEGER, field_name TEXT, field_value TEXT)''')
    cursor.execute('''CREATE TABLE IF NOT EXISTS news (id INTEGER PRIMARY KEY, author TEXT, text TEXT, date TEXT)''')
    cursor.execute('''CREATE TABLE IF NOT EXISTS laws (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT)''')
    cursor.execute('''CREATE TABLE IF NOT EXISTS marriages (id INTEGER PRIMARY KEY AUTOINCREMENT, user1_id INTEGER, user2_id INTEGER)''')
    cursor.execute('''CREATE TABLE IF NOT EXISTS wanted (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, reason TEXT)''')
    cursor.execute('''CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)''')
    cursor.execute('''CREATE TABLE IF NOT EXISTS mutes (user_id INTEGER PRIMARY KEY, until INTEGER)''')
    conn.commit()
    conn.close()

def get_or_create_user(user_id, name):
    conn = sqlite3.connect("svahuilsk_vk.db")
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM citizens WHERE user_id = ?", (user_id,))
    if not cursor.fetchone():
        cursor.execute("INSERT INTO citizens (user_id, name) VALUES (?, ?)", (user_id, name))
    else:
        cursor.execute("UPDATE citizens SET name = ? WHERE user_id = ?", (name, user_id))
    conn.commit()
    conn.close()

def resolve_user_vk(text):
    match = re.search(r"\[id(\d+)\|", text)
    if match: return int(match.group(1))
    if text.isdigit(): return int(text)
    return None

def get_group_id():
    conn = sqlite3.connect("svahuilsk_vk.db")
    res = conn.execute("SELECT value FROM settings WHERE key = 'group_id'").fetchone()
    conn.close()
    return int(res[0]) if res else None

def get_user_name(user_id):
    conn = sqlite3.connect("svahuilsk_vk.db")
    fields = dict(conn.execute("SELECT field_name, field_value FROM passport_fields WHERE user_id = ?", (user_id,)).fetchall())
    vk_name_res = conn.execute("SELECT name FROM citizens WHERE user_id = ?", (user_id,)).fetchone()
    conn.close()

    parts = [fields.get("Фамилия", ""), fields.get("Имя", ""), fields.get("Отчество", "")]
    parts = [p for p in parts if p]
    vk_name = vk_name_res[0] if vk_name_res else f"ID {user_id}"
    return " ".join(parts) if parts else vk_name

def get_mention(user_id):
    return f"[id{user_id}|{get_user_name(user_id)}]"

# --- СОСТОЯНИЯ (FSM ВК) ---
class AppFSM(BaseStateGroup):
    pass_target = 0
    pass_field = 1
    pass_value = 2
    mod_target = 3
    recog_target = 4
    recog_status = 5
    wanted_target = 6
    wanted_reason = 7
    report_target = 8
    report_reason = 9
    fire_target = 10
    news_text = 11 # Новое состояние для новостей

# --- КЛАВИАТУРЫ ---
def get_cancel_kb():
    return Keyboard(inline=True).add(Callback("❌ Отмена", {"cmd": "cancel"})).get_json()

def main_menu_kb():
    kb = Keyboard(inline=True)
    kb.add(Callback("🪪 Мой паспорт", {"cmd": "passport"}), color=KeyboardButtonColor.PRIMARY)
    kb.add(Callback("📰 Новости", {"cmd": "news"}), color=KeyboardButtonColor.SECONDARY).row()
    kb.add(Callback("📜 Законы", {"cmd": "laws"}), color=KeyboardButtonColor.SECONDARY)
    kb.add(Callback("💼 Биржа труда", {"cmd": "jobs"}), color=KeyboardButtonColor.POSITIVE).row()
    kb.add(Callback("🚓 База розыска", {"cmd": "wanted_list"}), color=KeyboardButtonColor.NEGATIVE)
    kb.add(Callback("🚨 Пожаловаться", {"cmd": "report_user"}), color=KeyboardButtonColor.NEGATIVE)
    return kb.get_json()

def get_reply_kb(user_id, peer_id):
    kb = Keyboard(one_time=False, inline=False)
    kb.add(Text("🏛 Меню Свахуильска"), color=KeyboardButtonColor.PRIMARY)
    if user_id in ADMINS and peer_id < 2000000000:
        kb.row().add(Text("⚙️ Панель Властей"), color=KeyboardButtonColor.NEGATIVE)
    return kb.get_json()

def admin_panel_kb():
    kb = Keyboard(inline=True)
    kb.add(Callback("🪪 Изменить паспорт", {"cmd": "admin_edit_pass"})).row()
    kb.add(Callback("💼 Уволить с работы", {"cmd": "admin_fire"})).row()
    kb.add(Callback("📢 Признание", {"cmd": "admin_recognize"}), color=KeyboardButtonColor.PRIMARY)
    kb.add(Callback("📝 Написать новость", {"cmd": "admin_news"}), color=KeyboardButtonColor.POSITIVE).row()
    kb.add(Callback("🚓 Розыск", {"cmd": "admin_wanted"}), color=KeyboardButtonColor.NEGATIVE)
    kb.add(Callback("⚖️ Модерация", {"cmd": "admin_mod"}), color=KeyboardButtonColor.NEGATIVE)
    return kb.get_json()

# --- ОБРАБОТЧИК ИНЛАЙН КНОПОК ВК ---
@bot.on.raw_event(GroupEventType.MESSAGE_EVENT, dataclass=MessageEvent)
async def handle_message_event(event: MessageEvent):
    payload = event.payload
    cmd = payload.get("cmd")
    user_id = event.user_id
    peer_id = event.peer_id

    if cmd == "cancel":
        await bot.state_dispenser.delete(peer_id)
        await bot.api.messages.send_message_event_answer(event_id=event.event_id, user_id=user_id, peer_id=peer_id, event_data={"type": "show_snackbar", "text": "Отменено!"})
        await bot.api.messages.send(peer_id=peer_id, message="Действие отменено 🔙", random_id=0)
        return

    if cmd == "passport":
        fields = sqlite3.connect("svahuilsk_vk.db").execute("SELECT field_name, field_value FROM passport_fields WHERE user_id = ?", (user_id,)).fetchall()
        text = f"🪪 ПАСПОРТ СВАХУИЛЬЦА\n\n👤 ФИО: {get_mention(user_id)}\n"
        ex_f = ["Имя", "Фамилия", "Отчество"]
        added = False
        for f_n, f_v in fields:
            if f_n not in ex_f:
                text += f"🔹 {f_n}: {f_v}\n"
                added = True
        if not added: text += "Остальные данные не заполнены."
        await bot.api.messages.send(peer_id=peer_id, message=text, random_id=0)

    elif cmd == "news":
        news = sqlite3.connect("svahuilsk_vk.db").execute("SELECT author, text, date FROM news WHERE id = 1").fetchone()
        text = f"📰 ГЛАВНАЯ НОВОСТЬ\n\n{news[1]}\n\nАвтор: {news[0]} | {news[2]}" if news else "Новостей нет."
        await bot.api.messages.send(peer_id=peer_id, message=text, random_id=0)

    elif cmd == "laws":
        laws = sqlite3.connect("svahuilsk_vk.db").execute("SELECT id, text FROM laws").fetchall()
        text = "📜 ЗАКОНЫ СВАХУИЛЬСКА:\n\n"
        for law in laws: text += f"Статья {law[0]}: {law[1]}\n\n"
        if not laws: text = "Законы пока не приняты."
        await bot.api.messages.send(peer_id=peer_id, message=text, random_id=0)

    elif cmd == "wanted_list":
        cr = sqlite3.connect("svahuilsk_vk.db").execute("SELECT username, reason FROM wanted").fetchall()
        text = "🚓 БАЗА РОЗЫСКА:\n\n"
        for w_n, w_r in cr: text += f"🔴 {w_n}\nПричина: {w_r}\n\n"
        if not cr: text += "Преступников нет."
        await bot.api.messages.send(peer_id=peer_id, message=text, random_id=0)

    elif cmd == "jobs":
        kb = Keyboard(inline=True)
        kb.add(Callback("⛏ Шахтёр", {"cmd": "applyjob", "job": "Шахтёр"}))
        kb.add(Callback("🌾 Фермер", {"cmd": "applyjob", "job": "Фермер"})).row()
        kb.add(Callback("🏗 Строитель", {"cmd": "applyjob", "job": "Строитель"}))
        await bot.api.messages.send(peer_id=peer_id, message=f"💼 Биржа труда\n{get_mention(user_id)}, выберите вакансию:", keyboard=kb.get_json(), random_id=0)

    elif cmd == "applyjob":
        job = payload.get("job")
        for admin in ADMINS:
            kb = Keyboard(inline=True)
            kb.add(Callback("✅ Принять", {"cmd": "jobok", "u": user_id, "j": job}), color=KeyboardButtonColor.POSITIVE)
            kb.add(Callback("❌ Отказ", {"cmd": "jobno", "u": user_id, "j": job}), color=KeyboardButtonColor.NEGATIVE)
            try: await bot.api.messages.send(peer_id=admin, message=f"💼 Заявка!\nЖитель {get_mention(user_id)} хочет стать: {job}", keyboard=kb.get_json(), random_id=0)
            except: pass
        await bot.api.messages.send_message_event_answer(event_id=event.event_id, user_id=user_id, peer_id=peer_id, event_data={"type": "show_snackbar", "text": "Заявка отправлена!"})

    elif cmd == "jobok":
        u_id, job = payload.get("u"), payload.get("j")
        conn = sqlite3.connect("svahuilsk_vk.db")
        conn.execute("DELETE FROM passport_fields WHERE user_id = ? AND field_name = 'Профессия'", (u_id,))
        conn.execute("INSERT INTO passport_fields (user_id, field_name, field_value) VALUES (?, 'Профессия', ?)", (u_id, job))
        conn.commit()
        conn.close()
        grp = get_group_id()
        if grp:
            try: await bot.api.messages.send(peer_id=grp, message=f"🎉 Власти официально утвердили {get_mention(u_id)} на должность: {job}!", random_id=0)
            except: pass

    elif cmd == "jobno":
        grp = get_group_id()
        if grp:
            try: await bot.api.messages.send(peer_id=grp, message=f"😔 Власти отклонили заявку {get_mention(payload.get('u'))} на {payload.get('j')}.", random_id=0)
            except: pass

    # Меню Админа
    elif cmd == "admin_edit_pass":
        await bot.api.messages.send(peer_id=peer_id, message="Введите [id|упоминание] или ID жителя:", keyboard=get_cancel_kb(), random_id=0)
        await bot.state_dispenser.set(peer_id, AppFSM.pass_target)
    elif cmd == "admin_fire":
        await bot.api.messages.send(peer_id=peer_id, message="Введите [id|упоминание] или ID для увольнения:", keyboard=get_cancel_kb(), random_id=0)
        await bot.state_dispenser.set(peer_id, AppFSM.fire_target)
    elif cmd == "admin_recognize":
        await bot.api.messages.send(peer_id=peer_id, message="Введите [id|упоминание] или ID жителя:", keyboard=get_cancel_kb(), random_id=0)
        await bot.state_dispenser.set(peer_id, AppFSM.recog_target)
    elif cmd == "admin_news":
        await bot.api.messages.send(peer_id=peer_id, message="Введите текст главной новости (он заменит текущую):", keyboard=get_cancel_kb(), random_id=0)
        await bot.state_dispenser.set(peer_id, AppFSM.news_text)
    elif cmd == "admin_wanted":
        kb = Keyboard(inline=True)
        kb.add(Callback("🔴 Добавить", {"cmd": "wanted_add"}), color=KeyboardButtonColor.NEGATIVE)
        kb.add(Callback("🟢 Очистить", {"cmd": "wanted_clear"}), color=KeyboardButtonColor.POSITIVE)
        await bot.api.messages.send(peer_id=peer_id, message="Управление розыском:", keyboard=kb.get_json(), random_id=0)
    elif cmd == "admin_mod":
        await bot.api.messages.send(peer_id=peer_id, message="Введите [id|упоминание] или ID нарушителя:", keyboard=get_cancel_kb(), random_id=0)
        await bot.state_dispenser.set(peer_id, AppFSM.mod_target)

    elif cmd == "wanted_clear":
        conn = sqlite3.connect("svahuilsk_vk.db")
        conn.execute("DELETE FROM wanted")
        conn.commit()
        await bot.api.messages.send(peer_id=peer_id, message="✅ База розыска очищена!", random_id=0)
    elif cmd == "wanted_add":
        await bot.api.messages.send(peer_id=peer_id, message="Имя или ID преступника:", keyboard=get_cancel_kb(), random_id=0)
        await bot.state_dispenser.set(peer_id, AppFSM.wanted_target)

    elif cmd == "report_user":
        await bot.api.messages.send(peer_id=peer_id, message="🚨 Введите [id|упоминание] или ID нарушителя:", keyboard=get_cancel_kb(), random_id=0)
        await bot.state_dispenser.set(peer_id, AppFSM.report_target)

    elif cmd == "fmod":
        act, tid = payload.get("a"), payload.get("t")
        grp = get_group_id()
        if not grp: return
        if act == "close":
            await bot.api.messages.send(peer_id=peer_id, message="✅ Жалоба закрыта.", random_id=0)
        elif act == "mute":
            conn = sqlite3.connect("svahuilsk_vk.db")
            conn.execute("INSERT OR REPLACE INTO mutes (user_id, until) VALUES (?, ?)", (tid, int(time.time()) + 3600))
            conn.commit()
            await bot.api.messages.send(peer_id=peer_id, message="✅ Выдан Мут на 1 час (Удаление сообщений).", random_id=0)
        elif act == "ban":
            try: 
                await bot.api.messages.remove_chat_user(chat_id=grp - 2000000000, user_id=tid)
                await bot.api.messages.send(peer_id=peer_id, message="✅ Исключен из беседы.", random_id=0)
            except: pass

    elif cmd == "execmod":
        act, tid, dur = payload.get("a"), payload.get("t"), payload.get("d", 0)
        grp = get_group_id()
        if act == "mute":
            conn = sqlite3.connect("svahuilsk_vk.db")
            conn.execute("INSERT OR REPLACE INTO mutes (user_id, until) VALUES (?, ?)", (tid, int(time.time()) + dur))
            conn.commit()
            await bot.api.messages.send(peer_id=peer_id, message=f"✅ Мут выдан на {dur//60} минут.", random_id=0)
        elif act == "ban":
            try: await bot.api.messages.remove_chat_user(chat_id=grp - 2000000000, user_id=tid)
            except: pass
            await bot.api.messages.send(peer_id=peer_id, message="✅ Исключен (БАН).", random_id=0)
        elif act == "unban":
            conn = sqlite3.connect("svahuilsk_vk.db")
            conn.execute("DELETE FROM mutes WHERE user_id = ?", (tid,))
            conn.commit()
            await bot.api.messages.send(peer_id=peer_id, message="✅ Мут/Бан снят.", random_id=0)
        await bot.state_dispenser.delete(peer_id)

    elif cmd == "marry_ans":
        act, u1, u2 = payload.get("a"), payload.get("u1"), payload.get("u2")
        if act == "no":
            await bot.api.messages.send(peer_id=peer_id, message="💔 Отказ от свадьбы.", random_id=0)
        elif act == "yes":
            if user_id != u2: return
            conn = sqlite3.connect("svahuilsk_vk.db")
            conn.execute("INSERT INTO marriages (user1_id, user2_id) VALUES (?, ?)", (u1, u2))
            m_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
            conn.commit()
            await bot.api.messages.send(peer_id=peer_id, message="💍 Запрос отправлен властям!", random_id=0)
            
            kb = Keyboard(inline=True).add(Callback("🏛 Одобрить брак", {"cmd": "adminmarry", "m": m_id})).get_json()
            for admin in ADMINS:
                try: await bot.api.messages.send(peer_id=admin, message=f"💍 Запрос на брак: {get_mention(u1)} и {get_mention(u2)}", keyboard=kb, random_id=0)
                except: pass

    elif cmd == "adminmarry":
        m_id = payload.get("m")
        conn = sqlite3.connect("svahuilsk_vk.db")
        m = conn.execute("SELECT user1_id, user2_id FROM marriages WHERE id = ?", (m_id,)).fetchone()
        if m:
            u1, u2 = m
            conn.execute("DELETE FROM marriages WHERE id = ?", (m_id,))
            d = datetime.now().strftime("%d.%m.%Y")
            conn.execute("DELETE FROM passport_fields WHERE user_id = ? AND field_name = 'Брак'", (u1,))
            conn.execute("DELETE FROM passport_fields WHERE user_id = ? AND field_name = 'Брак'", (u2,))
            conn.execute("INSERT INTO passport_fields (user_id, field_name, field_value) VALUES (?, 'Брак', ?)", (u1, f"В браке с {get_user_name(u2)} ({d})"))
            conn.execute("INSERT INTO passport_fields (user_id, field_name, field_value) VALUES (?, 'Брак', ?)", (u2, f"В браке с {get_user_name(u1)} ({d})"))
            conn.commit()
            grp = get_group_id()
            if grp:
                try: await bot.api.messages.send(peer_id=grp, message=f"🎊 ОФИЦИАЛЬНО!\nВласть утвердила брак между {get_mention(u1)} и {get_mention(u2)}! Горько!", random_id=0)
                except: pass
        conn.close()

    try: await bot.api.messages.send_message_event_answer(event_id=event.event_id, user_id=user_id, peer_id=peer_id)
    except: pass

# --- ОСНОВНЫЕ КОМАНДЫ ---
@bot.on.message(text=["/start", "/menu", "🏛 Меню Свахуильска"])
async def show_menu(message: Message):
    get_or_create_user(message.from_id, "Житель")
    mention = get_mention(message.from_id)
    await message.answer(f"🏛 Главное меню {mention}:", keyboard=main_menu_kb())
    await message.answer("Используй кнопки:", keyboard=get_reply_kb(message.from_id, message.peer_id))

@bot.on.message(text="⚙️ Панель Властей")
async def admin_panel_cmd(message: Message):
    if message.from_id in ADMINS and message.peer_id < 2000000000:
        await message.answer("⚙️ Система управления:", keyboard=admin_panel_kb())

@bot.on.message(text=["брак <text>", "Брак <text>"])
async def propose_m(message: Message):
    u1_id = message.from_id
    u2_id = resolve_user_vk(message.text)
    if not u2_id: return await message.answer("Укажи кого-то: брак [упоминание]")
    if u1_id == u2_id: return await message.answer("Нельзя жениться на себе!")

    kb = Keyboard(inline=True)
    kb.add(Callback("💍 Да", {"cmd": "marry_ans", "a": "yes", "u1": u1_id, "u2": u2_id}), color=KeyboardButtonColor.POSITIVE)
    kb.add(Callback("💔 Нет", {"cmd": "marry_ans", "a": "no", "u1": u1_id, "u2": u2_id}), color=KeyboardButtonColor.NEGATIVE)
    await message.answer(f"💍 {get_mention(u2_id)}, {get_mention(u1_id)} предлагает брак! Согласны?", keyboard=kb.get_json())

# --- FSM ОБРАБОТЧИКИ СОСТОЯНИЙ ---
@bot.on.message(state=AppFSM.pass_target)
async def pass_t_handler(message: Message):
    tid = resolve_user_vk(message.text)
    if not tid: return await message.answer("❌ Не найден.", keyboard=get_cancel_kb())
    await bot.state_dispenser.set(message.peer_id, AppFSM.pass_field, target_id=tid)
    await message.answer(f"Паспорт {get_mention(tid)}\nВведите НАЗВАНИЕ поля (например: Прописка):", keyboard=get_cancel_kb())

@bot.on.message(state=AppFSM.pass_field)
async def pass_f_handler(message: Message):
    await bot.state_dispenser.set(message.peer_id, AppFSM.pass_value, target_id=message.state_peer.payload["target_id"], field=message.text.strip())
    await message.answer(f"Введите ЗНАЧЕНИЕ для поля '{message.text}' (напишите '-', чтобы удалить):", keyboard=get_cancel_kb())

@bot.on.message(state=AppFSM.pass_value)
async def pass_v_handler(message: Message):
    payload = message.state_peer.payload
    tid, field, val = payload["target_id"], payload["field"], message.text.strip()
    
    conn = sqlite3.connect("svahuilsk_vk.db")
    if field.lower() in ["имя", "фамилия", "отчество"]:
        conn.execute("DELETE FROM passport_fields WHERE user_id = ? AND field_name = ?", (tid, field))
        if val != "-": conn.execute("INSERT INTO passport_fields (user_id, field_name, field_value) VALUES (?, ?, ?)", (tid, field, val))
    else:
        conn.execute("DELETE FROM passport_fields WHERE user_id = ? AND field_name = ?", (tid, field))
        if val != "-": conn.execute("INSERT INTO passport_fields (user_id, field_name, field_value) VALUES (?, ?, ?)", (tid, field, val))
    conn.commit()
    conn.close()

    await bot.state_dispenser.delete(message.peer_id)
    await message.answer(f"✅ Сохранено: {field} = {val}")

@bot.on.message(state=AppFSM.news_text)
async def news_t_handler(message: Message):
    author = get_user_name(message.from_id)
    date = datetime.now().strftime("%d.%m.%Y")
    
    # Сохраняем в базу (id=1, так как главная новость у нас одна)
    conn = sqlite3.connect("svahuilsk_vk.db")
    conn.execute("INSERT OR REPLACE INTO news (id, author, text, date) VALUES (1, ?, ?, ?)", (author, message.text, date))
    conn.commit()
    conn.close()
    
    await bot.state_dispenser.delete(message.peer_id)
    await message.answer("✅ Главная новость успешно опубликована!")
    
    # Отправляем уведомление в беседу
    grp = get_group_id()
    if grp:
        try: await bot.api.messages.send(peer_id=grp, message=f"📰 ВНИМАНИЕ, НОВОСТЬ!\n\n{message.text}\n\nАвтор: {author}", random_id=0)
        except: pass

@bot.on.message(state=AppFSM.report_target)
async def rep_t_handler(message: Message):
    tid = resolve_user_vk(message.text)
    if not tid: return await message.answer("❌ Не найден.", keyboard=get_cancel_kb())
    await bot.state_dispenser.set(message.peer_id, AppFSM.report_reason, target_id=tid)
    await message.answer("Опишите причину жалобы:", keyboard=get_cancel_kb())

@bot.on.message(state=AppFSM.report_reason)
async def rep_r_handler(message: Message):
    tid = message.state_peer.payload["target_id"]
    kb = Keyboard(inline=True)
    kb.add(Callback("🔇 Мут 1ч", {"cmd": "fmod", "a": "mute", "t": tid})).add(Callback("⛔️ Бан", {"cmd": "fmod", "a": "ban", "t": tid})).row()
    kb.add(Callback("🟢 Закрыть", {"cmd": "fmod", "a": "close", "t": tid}))
    for admin in ADMINS:
        try: await bot.api.messages.send(peer_id=admin, message=f"🚨 ЖАЛОБА!\nОт: {get_mention(message.from_id)}\nНа: {get_mention(tid)}\n\nПричина: {message.text}", keyboard=kb.get_json(), random_id=0)
        except: pass
    await bot.state_dispenser.delete(message.peer_id)
    await message.answer("✅ Жалоба отправлена.")

@bot.on.message(state=AppFSM.mod_target)
async def mod_t_handler(message: Message):
    tid = resolve_user_vk(message.text)
    if not tid: return await message.answer("❌ Не найден.", keyboard=get_cancel_kb())
    kb = Keyboard(inline=True)
    kb.add(Callback("🔇 Мут 15м", {"cmd": "execmod", "a": "mute", "t": tid, "d": 900}))
    kb.add(Callback("🔇 Мут 1ч", {"cmd": "execmod", "a": "mute", "t": tid, "d": 3600})).row()
    kb.add(Callback("⛔️ Бан", {"cmd": "execmod", "a": "ban", "t": tid}))
    kb.add(Callback("🕊 Разбан", {"cmd": "execmod", "a": "unban", "t": tid}))
    await bot.state_dispenser.delete(message.peer_id)
    await message.answer(f"Что делаем с {get_mention(tid)}?", keyboard=kb.get_json())

@bot.on.message(state=AppFSM.fire_target)
async def fire_t_handler(message: Message):
    tid = resolve_user_vk(message.text)
    if not tid: return await message.answer("❌ Не найден.", keyboard=get_cancel_kb())
    
    conn = sqlite3.connect("svahuilsk_vk.db")
    job = conn.execute("SELECT field_value FROM passport_fields WHERE user_id = ? AND field_name = 'Профессия'", (tid,)).fetchone()
    if not job: return await message.answer(f"⚠️ Он нигде не работает.")
    
    conn.execute("DELETE FROM passport_fields WHERE user_id = ? AND field_name = 'Профессия'", (tid,))
    conn.commit()
    conn.close()
    
    await bot.state_dispenser.delete(message.peer_id)
    await message.answer(f"✅ Уволен: {job[0]}")
    grp = get_group_id()
    if grp:
        try: await bot.api.messages.send(peer_id=grp, message=f"📢 УВОЛЬНЕНИЕ\nГражданин {get_mention(tid)} освобожден от: {job[0]}.", random_id=0)
        except: pass

@bot.on.message(state=AppFSM.recog_target)
async def rec_t_handler(message: Message):
    tid = resolve_user_vk(message.text)
    if not tid: return await message.answer("❌ Не найден.", keyboard=get_cancel_kb())
    await bot.state_dispenser.set(message.peer_id, AppFSM.recog_status, target_id=tid)
    await message.answer("Кем объявляем?:", keyboard=get_cancel_kb())

@bot.on.message(state=AppFSM.recog_status)
async def rec_s_handler(message: Message):
    tid = message.state_peer.payload["target_id"]
    grp = get_group_id()
    await bot.state_dispenser.delete(message.peer_id)
    if grp:
        try:
            await bot.api.messages.send(peer_id=grp, message=f"🏛 ОФИЦИАЛЬНОЕ ЗАЯВЛЕНИЕ!\n\nВласти признают {get_mention(tid)} как: {message.text}!", random_id=0)
            await message.answer("✅ Объявлено в беседе!")
        except: await message.answer("❌ Ошибка отправки в беседу.")

@bot.on.message(state=AppFSM.wanted_target)
async def wan_t_handler(message: Message):
    await bot.state_dispenser.set(message.peer_id, AppFSM.wanted_reason, target_name=message.text)
    await message.answer("Причина (статья):", keyboard=get_cancel_kb())

@bot.on.message(state=AppFSM.wanted_reason)
async def wan_r_handler(message: Message):
    name = message.state_peer.payload["target_name"]
    conn = sqlite3.connect("svahuilsk_vk.db")
    conn.execute("INSERT INTO wanted (username, reason) VALUES (?, ?)", (name, message.text))
    conn.commit()
    await bot.state_dispenser.delete(message.peer_id)
    await message.answer("✅ Добавлен в розыск!")

# --- СИСТЕМНОЕ И МУТЫ (ВК) --- ПЕРЕМЕЩЕНО В САМЫЙ НИЗ!
@bot.on.message()
async def catch_all_and_mutes(message: Message):
    user_id = message.from_id
    peer_id = message.peer_id

    if user_id > 0:
        try:
            user_info = await bot.api.users.get(user_ids=[user_id])
            name = f"{user_info[0].first_name} {user_info[0].last_name}" if user_info else "Житель"
            get_or_create_user(user_id, name)
        except: pass
        
    if peer_id > 2000000000:
        conn = sqlite3.connect("svahuilsk_vk.db")
        conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('group_id', ?)", (str(peer_id),))
        
        mute_data = conn.execute("SELECT until FROM mutes WHERE user_id = ?", (user_id,)).fetchone()
        conn.commit()
        conn.close()

        if mute_data:
            if time.time() < mute_data[0]:
                try: await bot.api.messages.delete(peer_id=peer_id, message_ids=[message.conversation_message_id], delete_for_all=True)
                except: pass
            else:
                conn = sqlite3.connect("svahuilsk_vk.db")
                conn.execute("DELETE FROM mutes WHERE user_id = ?", (user_id,))
                conn.commit()
                conn.close()

# Запуск
if __name__ == "__main__":
    init_db()
    print("Свахуильск ВКонтакте V1.3 Запущен!")
    bot.run_forever()
