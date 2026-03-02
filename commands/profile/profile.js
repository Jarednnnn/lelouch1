import { resolveLidToRealJid } from "../../lib/utils.js"

const growth = Math.pow(Math.PI / Math.E, 1.618) * Math.E * 0.75
function xpRange(level, multiplier = global.multiplier || 2) {
  if (level < 0) throw new TypeError('level cannot be negative value')
  level = Math.floor(level)
  const min = level === 0 ? 0 : Math.round(Math.pow(level, growth) * multiplier) + 1
  const max = Math.round(Math.pow(level + 1, growth) * multiplier)
  return { min, max, xp: max - min }
}

export default {
  command: ['profile', 'perfil'],
  category: 'rpg',
  run: async (client, m, args, usedPrefix, command) => {
    const texto = m.mentionedJid
    const who2 = texto.length > 0 ? texto[0] : m.quoted ? m.quoted.sender : m.sender
    const userId = await resolveLidToRealJid(who2, client, m.chat)

    // Obtener datos de la base de datos
    const chat = global.db.data.chats[m.chat] || {}
    const globalUsers = global.db.data.users || {}

    // Verificar si el usuario existe en el chat actual
    const userExists = chat.users?.[userId]
    if (!userExists) {
      return m.reply('✎ El usuario *mencionado* no está *registrado* en el bot')
    }

    const idBot = client.user.id.split(':')[0] + '@s.whatsapp.net'
    const settings = global.db.data.settings[idBot] || {}
    const currency = settings.currency || ''

    const user = chat.users[userId] || {}
    const user2 = globalUsers[userId] || {}
    const name = user2.name || 'Sin nombre'
    const birth = user2.birth || 'Sin especificar'
    const genero = user2.genre || 'Oculto'
    const comandos = user2.usedcommands || 0
    const pareja = user2.marry ? (globalUsers[user2.marry]?.name || 'Desconocido') : 'Nadie'
    const estadoCivil = genero === 'Mujer' ? 'Casada con' : genero === 'Hombre' ? 'Casado con' : 'Casadx con'
    const desc = user2.description ? `\n${user2.description}` : ''
    const pasatiempo = user2.pasatiempo ? `${user2.pasatiempo}` : 'No definido'
    const exp = user2.exp || 0
    const nivel = user2.level || 0
    const chocolates = user.coins || 0
    const banco = user.bank || 0
    const totalCoins = chocolates + banco
    const favId = user.favorite
    const favLine = favId && chat.characters?.[favId] ? `\n๑ Claim favorito » *${chat.characters[favId].name || '???'}*\n` : ''

    const ownedIDs = Object.entries(chat.characters || {}).filter(([, c]) => c.user === userId).map(([id]) => id)
    const haremCount = ownedIDs.length
    const haremValue = ownedIDs.reduce((acc, id) => {
      const local = chat.characters?.[id] || {}
      const globalRec = global.db.data.characters?.[id] || {}  
      const value = (globalRec && typeof globalRec.value === 'number') ? globalRec.value : (local && typeof local.value === 'number') ? local.value : 0
      return acc + value
    }, 0)

    // Función para obtener foto con timeout de 500ms
    const obtenerFotoConTimeout = async (userId) => {
      try {
        const fotoPromise = client.profilePictureUrl(userId, 'image')
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), 500)
        )
        return await Promise.race([fotoPromise, timeoutPromise])
      } catch {
        return null // Si falla o hay timeout, devolvemos null
      }
    }

    // Ejecutar foto y ranking en paralelo
    const [perfil, rank] = await Promise.all([
      obtenerFotoConTimeout(userId),
      (async () => {
        const users = Object.entries(globalUsers).map(([key, value]) => ({ ...value, jid: key }))
        users.sort((a, b) => (b.level || 0) - (a.level || 0))
        return users.findIndex((u) => u.jid === userId) + 1
      })()
    ])

    // Asegurar que perfil sea un string (usar imagen por defecto si es null)
    const fotoFinal = perfil || 'https://cdn.yuki-wabot.my.id/files/2PVh.jpeg'

    const { min, xp } = xpRange(nivel, global.multiplier)
    const progreso = exp - min
    const porcentaje = xp > 0 ? Math.floor((progreso / xp) * 100) : 0

    const profileText = `「✿」 *Perfil* ◢ ${name} ◤${desc}

♛ Cumpleaños › *${birth}*
⸙ Pasatiempo › *${pasatiempo}*
⚥ Género › *${genero}*
♡ ${estadoCivil} › *${pareja}*

✿ Nivel › *${nivel}*
❀ Experiencia › *${exp.toLocaleString()}*
➨ Progreso › *${progreso} => ${xp}* _(${porcentaje}%)_
☆ Puesto › *#${rank}*

ꕥ Harem › *${haremCount}*
♤ Valor total › *${haremValue.toLocaleString()}*${favLine}
⛁ Coins totales › *¥${totalCoins.toLocaleString()} ${currency}*
❒ Comandos ejecutados › *${comandos.toLocaleString()}*`

    await client.sendMessage(m.chat, { image: { url: fotoFinal }, caption: profileText }, { quoted: m })
  }
}
