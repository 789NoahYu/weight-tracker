const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3100;

// ========== Supabase 配置 ==========
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wmvtfejiwcdhepifbaun.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdnRmZWppd2NkaGVwaWZiYXVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4MjMxODQsImV4cCI6MjA5ODM5OTE4NH0.az22Ws8nFB9Vy-jV5BxCHqtzslL935dW0WAayra3zRI';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ========== Data Layer (Supabase) ==========

async function getAllRecords() {
    const { data, error } = await supabase
        .from('records')
        .select('date, weight')
        .order('date', { ascending: true });
    if (error) throw new Error(error.message);
    return data || [];
}

async function upsertRecord(date, weight) {
    const { error } = await supabase
        .from('records')
        .upsert({ date, weight }, { onConflict: 'date' });
    if (error) throw new Error(error.message);
}

async function deleteRecord(date) {
    const { error } = await supabase
        .from('records')
        .delete()
        .eq('date', date);
    if (error) throw new Error(error.message);
}

async function updateRecord(oldDate, newDate, weight) {
    // Delete old record
    const { error: delErr } = await supabase
        .from('records')
        .delete()
        .eq('date', oldDate);
    if (delErr) throw new Error(delErr.message);
    // Insert new record
    const { error: insErr } = await supabase
        .from('records')
        .upsert({ date: newDate, weight }, { onConflict: 'date' });
    if (insErr) throw new Error(insErr.message);
}

// ========== Middleware ==========
app.use(express.json());
// 支持 public/ 目录和根目录两种文件布局
const publicDir = path.join(__dirname, 'public');
if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
}
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    const paths = [
        path.join(__dirname, 'public', 'index.html'),
        path.join(__dirname, 'index.html')
    ];
    for (const p of paths) {
        if (fs.existsSync(p)) {
            return res.sendFile(p);
        }
    }
    res.status(404).send('index.html not found.');
});

// ========== API Routes ==========

// GET /api/records - 获取所有记录
app.get('/api/records', async (req, res) => {
    try {
        const data = await getAllRecords();
        res.json({ success: true, data });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// POST /api/records - 添加或更新记录
app.post('/api/records', async (req, res) => {
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

    try {
        // Check if record exists
        const all = await getAllRecords();
        const existing = all.find(r => r.date === date);
        await upsertRecord(date, weight);
        res.json({ success: true, isNew: !existing, message: existing ? '已更新' : '记录成功' });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// DELETE /api/records/:date - 删除记录
app.delete('/api/records/:date', async (req, res) => {
    const { date } = req.params;
    try {
        const all = await getAllRecords();
        const before = all.length;
        await deleteRecord(date);
        const after = (await getAllRecords()).length;
        if (before === after) {
            return res.status(404).json({ success: false, message: '记录不存在' });
        }
        res.json({ success: true, message: '已删除' });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// PUT /api/records/:oldDate - 编辑记录
app.put('/api/records/:oldDate', async (req, res) => {
    const { oldDate } = req.params;
    const { date, weight } = req.body;

    if (!date) return res.status(400).json({ success: false, message: '请提供日期' });
    if (!weight || typeof weight !== 'number' || weight <= 0) {
        return res.status(400).json({ success: false, message: '请提供有效体重' });
    }

    try {
        await updateRecord(oldDate, date, weight);
        res.json({ success: true, message: '已更新' });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// ========== Start Server ==========
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════╗
║     💕 女朋友体重记录工具            ║
║                                      ║
║  本机访问: http://localhost:${PORT}      ║
║  数据持久化 ✅ 重启不丢失             ║
║                                      ║
║  女朋友填体重 → 你后台看分析          ║
╚══════════════════════════════════════╝
    `);
});
