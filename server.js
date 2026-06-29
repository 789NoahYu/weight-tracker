const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3100;

// ========== Data Layer ==========
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'records.json');

function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DATA_FILE)) {
        fs.writeFileSync(DATA_FILE, '[]', 'utf-8');
    }
}

function readRecords() {
    ensureDataDir();
    try {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        return JSON.parse(raw);
    } catch {
        return [];
    }
}

function writeRecords(records) {
    ensureDataDir();
    fs.writeFileSync(DATA_FILE, JSON.stringify(records, null, 2), 'utf-8');
}

// ========== Middleware ==========
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

// ========== API Routes ==========

// GET /api/records - 获取所有记录
app.get('/api/records', (req, res) => {
    const records = readRecords();
    res.json({ success: true, data: records });
});

// POST /api/records - 添加或更新记录
app.post('/api/records', (req, res) => {
    const { date, weight } = req.body;

    if (!date) {
        return res.status(400).json({ success: false, message: '请提供日期' });
    }
    if (!weight || typeof weight !== 'number' || weight <= 0) {
        return res.status(400).json({ success: false, message: '请提供有效体重' });
    }
    if (weight < 30 || weight > 200) {
        return res.status(400).json({ success: false, message: '体重范围应在 30~200 kg 之间' });
    }

    let records = readRecords();
    const existingIdx = records.findIndex(r => r.date === date);
    let isNew = false;

    if (existingIdx >= 0) {
        records[existingIdx].weight = weight;
    } else {
        records.push({ date, weight });
        isNew = true;
    }

    records.sort((a, b) => a.date.localeCompare(b.date));
    writeRecords(records);

    res.json({ success: true, isNew, message: isNew ? '记录成功' : '已更新' });
});

// DELETE /api/records/:date - 删除记录
app.delete('/api/records/:date', (req, res) => {
    const { date } = req.params;
    let records = readRecords();
    const before = records.length;
    records = records.filter(r => r.date !== date);

    if (records.length === before) {
        return res.status(404).json({ success: false, message: '记录不存在' });
    }

    writeRecords(records);
    res.json({ success: true, message: '已删除' });
});

// PUT /api/records/:oldDate - 编辑记录（改日期或体重）
app.put('/api/records/:oldDate', (req, res) => {
    const { oldDate } = req.params;
    const { date, weight } = req.body;

    if (!date) return res.status(400).json({ success: false, message: '请提供日期' });
    if (!weight || typeof weight !== 'number' || weight <= 0) {
        return res.status(400).json({ success: false, message: '请提供有效体重' });
    }

    let records = readRecords();
    records = records.filter(r => r.date !== oldDate);
    records = records.filter(r => r.date !== date); // deduplicate
    records.push({ date, weight });
    records.sort((a, b) => a.date.localeCompare(b.date));
    writeRecords(records);

    res.json({ success: true, message: '已更新' });
});

// ========== Start Server ==========
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════╗
║     💕 女朋友体重记录工具            ║
║                                      ║
║  本机访问: http://localhost:${PORT}      ║
║  局域网访问: http://<本机IP>:${PORT}     ║
║                                      ║
║  女朋友填体重 → 你后台看分析          ║
╚══════════════════════════════════════╝
    `);
});
