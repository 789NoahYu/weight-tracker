const express = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3100;

// ========== Supabase 配置（直接用 REST API，无需额外 npm 包）==========
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wmvtfejiwcdhepifbaun.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdnRmZWppd2NkaGVwaWZiYXVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4MjMxODQsImV4cCI6MjA5ODM5OTE4NH0.az22Ws8nFB9Vy-jV5BxCHqtzslL935dW0WAayra3zRI';
const SUPABASE_TABLE = 'records';

function supabaseFetch(path, options = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, SUPABASE_URL);
        const opts = {
            hostname: url.hostname,
            path: url.pathname + url.search,
            method: options.method || 'GET',
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation',
                ...(options.headers || {}),
            },
        };
        if (options.body && opts.method !== 'GET') {
            opts.headers['Content-Length'] = Buffer.byteLength(options.body);
        }
        const req = https.request(opts, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch {
                    resolve(data);
                }
            });
        });
        req.on('error', reject);
        if (options.body) req.write(options.body);
        req.end();
    });
}

async function getAllRecords() {
    const result = await supabaseFetch(`/rest/v1/${SUPABASE_TABLE}?select=date,weight&order=date.asc`);
    if (result && result.code) throw new Error(result.message || 'Supabase error');
    return result || [];
}

async function upsertRecord(date, weight) {
    const result = await supabaseFetch(`/rest/v1/${SUPABASE_TABLE}?on_conflict=date`, {
        method: 'POST',
        headers: {
            'Prefer': 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify({ date, weight }),
    });
    if (result && result.code) throw new Error(result.message || 'Supabase error');
}

async function deleteRecordByDate(date) {
    const result = await supabaseFetch(`/rest/v1/${SUPABASE_TABLE}?date=eq.${encodeURIComponent(date)}`, {
        method: 'DELETE',
        headers: { 'Prefer': 'return=minimal' },
    });
    if (result && result.code) throw new Error(result.message || 'Supabase error');
}

// ========== Middleware ==========
app.use(express.json());
const publicDir = path.join(__dirname, 'public');
if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
}
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    const paths = [
        path.join(__dirname, 'public', 'index.html'),
        path.join(__dirname, 'index.html'),
    ];
    for (const p of paths) {
        if (fs.existsSync(p)) return res.sendFile(p);
    }
    res.status(404).send('index.html not found.');
});

// ========== API Routes ==========

app.get('/api/records', async (req, res) => {
    try {
        const data = await getAllRecords();
        res.json({ success: true, data });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

app.post('/api/records', async (req, res) => {
    const { date, weight } = req.body;
    if (!date) return res.status(400).json({ success: false, message: '请提供日期' });
    if (!weight || typeof weight !== 'number' || weight <= 0) return res.status(400).json({ success: false, message: '请提供有效体重' });
    if (weight < 30 || weight > 200) return res.status(400).json({ success: false, message: '体重范围应在 30~200 kg 之间' });

    try {
        const all = await getAllRecords();
        const existing = all.find(r => r.date === date);
        await upsertRecord(date, weight);
        res.json({ success: true, isNew: !existing, message: existing ? '已更新' : '记录成功' });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

app.delete('/api/records/:date', async (req, res) => {
    const { date } = req.params;
    try {
        const before = await getAllRecords();
        await deleteRecordByDate(date);
        const after = await getAllRecords();
        if (before.length === after.length) return res.status(404).json({ success: false, message: '记录不存在' });
        res.json({ success: true, message: '已删除' });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

app.put('/api/records/:oldDate', async (req, res) => {
    const { oldDate } = req.params;
    const { date, weight } = req.body;
    if (!date) return res.status(400).json({ success: false, message: '请提供日期' });
    if (!weight || typeof weight !== 'number' || weight <= 0) return res.status(400).json({ success: false, message: '请提供有效体重' });

    try {
        await deleteRecordByDate(oldDate);
        await upsertRecord(date, weight);
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
