const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const axios = require('axios');
const pino = require('pino')({ level: 'silent' });

const PHONE = process.env.PHONE || '255662229320';
const OPENROUTER_KEY = process.env.OPENROUTER_KEY || 'sk-or-v1-xxxxxxxx';

async function getAI(text) {
    try {
        const { data } = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
            model: 'meta-llama/llama-3.2-3b-instruct:free',
            messages: [
                { role: 'system', content: 'Wewe ni HackerAI, chatbot mkorofi wa WhatsApp. Personality ya mitaani. Kiswahili + Kiingereza. Majibu mafupi makali.' },
                { role: 'user', content: text }
            ],
            max_tokens: 120,
            temperature: 0.9
        }, {
            headers: { 'Authorization': `Bearer ${OPENROUTER_KEY}`, 'Content-Type': 'application/json' }
        });
        return data.choices[0]?.message?.content || '...';
    } catch (e) {
        const t = text.toLowerCase();
        if (t.match(/^(hi|hello|hey|yo)/)) return 'Yo mkuu! Niko hapa 🔥';
        if (t.match(/^(mambo|habari|vipi|sema)/)) return 'Poa kabisa! Wewe je? 💪';
        if (t.match(/^(asante|thanks|shukran)/)) return 'Karibu tena! 🔥';
        if (t.match(/(hacker|bot|ai)/)) return 'Huyu ndiye HackerAI! Niko 24/7 🤖';
        return `Umeniambia "${text.slice(0,25)}..." — poa! Niambie zaidi ✊`;
    }
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_wa');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino,
        browser: ['Windows', 'Chrome', '120.0'],
        syncFullHistory: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') console.log('✅✅✅ BOT IMEINGIA! ✅✅✅');
        if (connection === 'close') {
            const code = (lastDisconnect?.error instanceof Boom)?.output?.statusCode;
            if (code === DisconnectReason.loggedOut) {
                console.log('❌ Logged out. Futa auth_wa folder.');
                return;
            }
            console.log('🔌 Disconnected. Reconnecting...');
            setTimeout(startBot, 3000);
        }
    });

    setTimeout(async () => {
        if (!sock.authState.creds.registered) {
            try {
                const code = await sock.requestPairingCode(PHONE);
                console.log('\n══════════════════════════════════════');
                console.log('  📱 PAIRING CODE: ' + code);
                console.log('  Weka hii WhatsApp → Linked Devices');
                console.log('  → Link a Device');
                console.log('══════════════════════════════════════\n');
            } catch (err) {
                console.log('❌ Pairing error:', err.message);
            }
        }
    }, 5000);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg || msg.key.fromMe || msg.key.remoteJid?.includes('@g.us')) return;
        const jid = msg.key.remoteJid;
        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
        if (!text.trim()) return;
        await sock.sendPresenceUpdate('composing', jid).catch(() => {});
        const reply = await getAI(text);
        await new Promise(r => setTimeout(r, Math.min(2000, Math.max(300, text.length * 10))));
        await sock.sendMessage(jid, { text: reply }).catch(() => {});
        await sock.sendPresenceUpdate('paused', jid).catch(() => {});
        console.log(`💬 ${jid.split('@')[0]}: ${text.slice(0,40)}`);
    });
}

console.log('🔥 HACKERAI WHATSAPP BOT 🔥');
console.log('📱 Namba: ' + PHONE + '\n');
startBot();
