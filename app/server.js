const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const PORT = process.env.PORT || 3000;

var last_message_id = 0;

app.use(express.static(__dirname));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 连接数据库
const db = new sqlite3.Database('database.db');

// 创建用户表
db.run(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL
    )
`);

// 创建消息表
db.run(`
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY,
        username TEXT NOT NULL,
        message TEXT NOT NULL
    )
`);

// 查询表中最大的 ID
db.get('SELECT MAX(id) AS max_id FROM messages', (err, row) => {
    if (err) {
        console.error(err.message);
    } else {
        // 获取最大的 ID
        last_message_id = row.max_id || 1;
    }
});

// 登录（注册）页面
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/login.html');
});

// 登录（注册）处理
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    if (username && password) {
        // 在数据库中查找用户
        db.get('SELECT * FROM users WHERE username = ? AND password = ?', [username, password], (err, row) => {
            if (err) {
                return res.status(500).json({ success: false, error: 'Internal Server Error' });
            }

            if (row) {
                // 用户存在，跳转到聊天页面
                res.redirect(`/chat?username=${encodeURIComponent(username)}`);
            } else {
                // 用户不存在，注册用户并跳转到聊天页面
                db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, password], (err) => {
                    if (err) {
                        return res.status(500).json({ success: false, error: 'Internal Server Error' });
                    }
                    res.redirect(`/chat?username=${encodeURIComponent(username)}`);
                });
            }
        });
    } else {
        res.status(400).json({ success: false, error: 'Invalid request' });
    }
});

// 聊天页面
app.get('/chat', (req, res) => {
    const username = req.query.username;
    if (!username) {
        res.redirect('/');
        return;
    }
    res.sendFile(__dirname + '/chat.html');
});

// 管理员页面
app.get('/admin', (req, res) => {
    res.sendFile(__dirname + '/admin.html');
});

// 获取所有用户
app.get('/api/users', (req, res) => {
    db.all('SELECT username FROM users', (err, rows) => {
        if (err) {
            return res.status(500).json({ success: false, error: 'Internal Server Error' });
        }
        const usernames = rows.map(row => row.username);
        res.json(usernames);
    });
});

// 获取所有消息
app.get('/api/messages', (req, res) => {
    db.all('SELECT * FROM messages', (err, rows) => {
        if (err) {
            return res.status(500).json({ success: false, error: 'Internal Server Error' });
        }
        res.json(rows);
    });
});

// 发送消息
// app.post('/api/messages', (req, res) => {
//     const { username, message } = req.body;
//     if (username && message) {
//         db.run('INSERT INTO messages (username, message) VALUES (?, ?)', [username, message], (err) => {
//             if (err) {
//                 return res.status(500).json({ success: false, error: 'Internal Server Error' });
//             }
//             const newMessage = { username, message };
//             io.emit('chat message', newMessage);
//             res.json({ success: true, message: newMessage });
//         });
//     } else {
//         res.status(400).json({ success: false, error: 'Invalid request' });
//     }
// });

// 删除消息
app.delete('/api/messages/:messageId', (req, res) => {
    const messageId = req.params.messageId;
    db.run('DELETE FROM messages WHERE id = ?', [messageId], (err) => {
        if (err) {
            return res.status(500).json({ success: false, error: 'Internal Server Error' });
        }
        io.emit('delete message', { id: messageId });
        res.json({ success: true });
    });
});


io.on('connection', (socket) => {
    console.log('a user connected');

    socket.on('chat message', (msg) => {
        msg.id = last_message_id++;
        db.run('INSERT INTO messages (id, username, message) VALUES (?, ?, ?)', [msg.id, msg.username, msg.message], (err) => {
            if (err) {
                console.error(err);
            } else {
                io.emit('chat message', msg);
            }
        });
    });

    socket.on('disconnect', () => {
        console.log('user disconnected');
    });
});

server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
