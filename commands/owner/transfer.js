// plugins/owner-transfer.js (versión con eliminación)
import { resolveLidToRealJid } from "../../lib/utils.js"

const formatMessage = (text) => `《✧》 ${text}`;

const normalizeNumber = (num) => {
    let cleaned = num.replace(/\s+/g, '');
    if (!cleaned.includes('@')) {
        cleaned = cleaned + '@s.whatsapp.net';
    }
    return cleaned;
};

function deepReplaceId(obj, oldId, newId, skipSettings = true) {
    if (typeof obj === 'string') {
        return obj === oldId ? newId : obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(item => deepReplaceId(item, oldId, newId, skipSettings));
    }
    if (obj && typeof obj === 'object') {
        if (skipSettings && obj === global.db.data.settings) {
            return obj;
        }
        const newObj = {};
        for (const [key, value] of Object.entries(obj)) {
            const newKey = deepReplaceId(key, oldId, newId, skipSettings);
            if (skipSettings && value === global.db.data.settings) {
                newObj[newKey] = value;
            } else {
                newObj[newKey] = deepReplaceId(value, oldId, newId, skipSettings);
            }
        }
        return newObj;
    }
    return obj;
}

export default {
    command: ['transfer', 'trf'],
    isOwner: true,
    run: async (client, m, args, usedPrefix, command) => {
        try {
            if (args.length < 2) {
                return client.reply(m.chat, formatMessage('Uso: #transfer <numero_origen> <numero_destino>\nEjemplo: #transfer 593981305645 593994524688'), m);
            }

            const origen = normalizeNumber(args[0]);
            const destino = normalizeNumber(args[1]);

            if (origen === destino) {
                return client.reply(m.chat, formatMessage('El origen y destino no pueden ser el mismo número.'), m);
            }

            await m.react('🕒');

            global.loadDatabase();

            // Guardar settings original
            const originalSettings = JSON.parse(JSON.stringify(global.db.data.settings));

            // Verificar que el origen exista (en users o en algún chat)
            const existeEnUsers = !!global.db.data.users[origen];
            let existeEnAlgunChat = false;
            for (const chatId in global.db.data.chats) {
                if (global.db.data.chats[chatId].users?.[origen]) {
                    existeEnAlgunChat = true;
                    break;
                }
            }
            if (!existeEnUsers && !existeEnAlgunChat) {
                await m.react('✖️');
                return client.reply(m.chat, formatMessage(`El usuario ${origen} no existe en la base de datos.`), m);
            }

            // Preparar datos del origen (copia profunda)
            const origenData = {
                users: global.db.data.users[origen] ? JSON.parse(JSON.stringify(global.db.data.users[origen])) : null,
                chats: {}
            };
            // Copiar datos de chats donde aparece el origen
            for (const chatId in global.db.data.chats) {
                if (global.db.data.chats[chatId].users?.[origen]) {
                    origenData.chats[chatId] = JSON.parse(JSON.stringify(global.db.data.chats[chatId].users[origen]));
                }
            }

            // Crear destino en users si no existe y si origen tenía users
            if (origenData.users) {
                if (!global.db.data.users[destino]) {
                    global.db.data.users[destino] = {
                        name: null,
                        exp: 0,
                        level: 0,
                        usedcommands: 0,
                        pasatiempo: "",
                        description: "",
                        marry: "",
                        genre: "",
                        birth: "",
                        metadatos: null,
                        metadatos2: null
                    };
                }
                // Transferir datos globales de users
                global.db.data.users[destino] = origenData.users;
            }

            // Transferir datos de chats
            for (const chatId in origenData.chats) {
                if (!global.db.data.chats[chatId]) {
                    global.db.data.chats[chatId] = { users: {} };
                }
                if (!global.db.data.chats[chatId].users) {
                    global.db.data.chats[chatId].users = {};
                }
                if (!global.db.data.chats[chatId].users[destino]) {
                    global.db.data.chats[chatId].users[destino] = {
                        stats: {},
                        usedTime: null,
                        lastCmd: 0,
                        coins: 0,
                        bank: 0,
                        afk: -1,
                        afkReason: "",
                        characters: []
                    };
                }
                global.db.data.chats[chatId].users[destino] = origenData.chats[chatId];
            }

            // --- ELIMINAR COMPLETAMENTE AL ORIGEN ---
            // Eliminar de users global
            delete global.db.data.users[origen];
            // Eliminar de todos los chats
            for (const chatId in global.db.data.chats) {
                if (global.db.data.chats[chatId].users?.[origen]) {
                    delete global.db.data.chats[chatId].users[origen];
                }
            }

            // Reemplazar referencias (marry, personajes, etc.) en TODA la base, excepto settings
            global.db.data = deepReplaceId(global.db.data, origen, destino, true);

            // Restaurar settings
            global.db.data.settings = originalSettings;

            // Guardar cambios
            global.saveDatabase();

            await m.react('✔️');
            client.reply(m.chat, formatMessage(`Progreso transferido exitosamente de ${origen} a ${destino}. El usuario origen ha sido eliminado de la base de datos.`), m);
        } catch (error) {
            console.error(error);
            await m.react('✖️');
            client.reply(m.chat, `⚠︎ Se ha producido un problema.\n${error.message}`, m);
        }
    }
}
