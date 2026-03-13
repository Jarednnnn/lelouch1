// Almacén global de timeouts
global.carreraTimeouts = global.carreraTimeouts || {}
import { resolveLidToRealJid } from '../../lib/utils.js'

/**
 * Normaliza cualquier ID a su JID real (@s.whatsapp.net).
 * Estrategia en orden de confiabilidad:
 *  1. Si ya es PN (@s.whatsapp.net), lo devuelve tal cual.
 *  2. Usa sock.signalRepository.lidMapping.getPNForLID (Baileys v7).
 *  3. Busca en groupMetadata cruzando id, lid y phoneNumber.
 *  4. Usa resolveLidToRealJid del bot como último recurso.
 *  5. Devuelve el original si nada funciona.
 */
async function toPN(id, client, chatId) {
  if (!id) return id

  // 1. Ya es PN
  if (id.endsWith('@s.whatsapp.net')) return id

  // 2. Baileys v7: lidMapping interno
  try {
    const pn = await client.signalRepository?.lidMapping?.getPNForLID?.(id)
    if (pn && pn.endsWith('@s.whatsapp.net')) return pn
  } catch (_) {}

  // 3. groupMetadata — cruza id, lid y phoneNumber
  try {
    const meta = await client.groupMetadata(chatId)
    const raw = id.replace(/@.*$/, '') // solo dígitos/número
    const found = meta.participants.find(p => {
      const pId   = (p.id  || '').replace(/@.*$/, '')
      const pLid  = (p.lid || '').replace(/@.*$/, '')
      const pPn   = (p.phoneNumber || '').replace(/[^0-9]/g, '')
      return (
        p.id  === id || p.lid === id ||
        pId   === raw || pLid === raw || pPn === raw
      )
    })
    if (found) {
      // Preferir phoneNumber si existe, luego id si es PN, luego lid
      if (found.phoneNumber) {
        const clean = found.phoneNumber.replace(/[^0-9]/g, '')
        return `${clean}@s.whatsapp.net`
      }
      if (found.id?.endsWith('@s.whatsapp.net')) return found.id
    }
  } catch (_) {}

  // 4. resolveLidToRealJid del bot
  try {
    const resolved = await resolveLidToRealJid(id, client, chatId)
    if (resolved?.endsWith('@s.whatsapp.net')) return resolved
  } catch (_) {}

  // 5. No se pudo resolver — devolver original
  return id
}

/**
 * Devuelve true si dos IDs pertenecen al mismo usuario,
 * comparando número limpio + JID completo + LID completo.
 */
function sameUser(a = '', b = '') {
  if (!a || !b) return false
  if (a === b) return true
  const clean = s => s.replace(/[^0-9]/g, '')
  const na = clean(a), nb = clean(b)
  return na.length >= 8 && na === nb
}

export default {
  command: ['carrera', 'aceptarcarrera'],
  category: 'economy',
  run: async (client, m, args, usedPrefix, command) => {
    const chat = global.db.data.chats[m.chat] ||= {}
    chat.users ||= {}
    chat.retoPendiente ||= null
    const botId = client.user.id.split(':')[0] + '@s.whatsapp.net'
    const monedas = global.db.data.settings[botId].currency

    if (chat.adminonly || !chat.economy) {
      return m.reply(`ꕥ Los comandos de *Economía* están desactivados.\n» *${usedPrefix}economy on*`)
    }

    // =================== COMANDO #carrera ===================
    if (command === 'carrera') {
      if (chat.carreraActiva) return m.reply('ꕥ Ya hay una carrera en curso.')

      const mentionedJid = m.mentionedJid
      const rawOpponent = mentionedJid[0] || (m.quoted ? m.quoted.sender : null)
      if (!rawOpponent) return m.reply(`ꕥ Menciona a alguien.\n> Ejemplo: *${usedPrefix}carrera @usuario 200*`)

      // Resolver IDs a PN real
      // Para el retador también usamos participantAlt si está disponible (Baileys v7)
      const senderRaw = m.sender || m.key?.participant || m.key?.remoteJid
      const senderAlt = m.key?.participantAlt  // PN si sender es LID, o viceversa
      let retador = senderAlt?.endsWith('@s.whatsapp.net') ? senderAlt
                  : await toPN(senderRaw, client, m.chat)

      // Para el oponente: también revisar si viene con Alt en mentionedJid
      // En Baileys v7 mentionedJid puede traer LIDs; el mensaje quoted puede tener participantAlt
      const oponenteAlt = m.quoted?.key?.participantAlt
      let oponente = oponenteAlt?.endsWith('@s.whatsapp.net') ? oponenteAlt
                   : await toPN(rawOpponent, client, m.chat)

      if (sameUser(retador, oponente)) return m.reply('ꕥ No puedes jugar contra ti mismo.')

      let apuesta = parseInt(args.find(a => !isNaN(a.replace(/[,.]/g, '')) && parseInt(a.replace(/[,.]/g, '')) >= 100)?.replace(/[,.]/g, ''))
      if (!apuesta) return m.reply(`ꕥ Apuesta mínima: 100 ${monedas}.`)

      if (!chat.users[retador]) chat.users[retador] = { coins: 0 }
      if (chat.users[retador].coins < apuesta) return m.reply(`ꕥ No tienes suficientes ${monedas}.`)

      // Limpiar reto viejo si existe
      if (chat.retoPendiente) {
        if (global.carreraTimeouts[m.chat]) clearTimeout(global.carreraTimeouts[m.chat])
        if (chat.retoPendiente.expiracion < Date.now()) {
          if (chat.users[chat.retoPendiente.retador]) chat.users[chat.retoPendiente.retador].coins += chat.retoPendiente.apuesta
          delete chat.retoPendiente
        } else return m.reply('ꕥ Hay un reto pendiente. Espera un momento.')
      }

      chat.users[retador].coins -= apuesta
      chat.retoPendiente = {
        retador,
        oponente,
        rawOponente: rawOpponent,
        apuesta,
        expiracion: Date.now() + 60000
      }

      global.carreraTimeouts[m.chat] = setTimeout(() => {
        if (chat.retoPendiente && chat.retoPendiente.retador === retador) {
          if (chat.users[retador]) chat.users[retador].coins += apuesta
          delete chat.retoPendiente
          client.sendMessage(m.chat, { text: 'ꕥ El reto ha expirado.' })
        }
      }, 60000)

      const nRetador = global.db.data.users[retador]?.name || retador.split('@')[0]
      const nOponente = global.db.data.users[oponente]?.name || oponente.split('@')[0] || rawOpponent.split('@')[0]

      const mensaje = `「✿」 *${nRetador}*, ¿confirmas retar a *${nOponente}*?\n\n❏ Apuesta: *${apuesta} ${monedas}* cada uno\n\n✐ Para aceptar escribe *${usedPrefix}aceptarcarrera*`
      await client.sendMessage(m.chat, { text: mensaje, mentions: [retador, oponente] }, { quoted: m })
    }

    // =================== COMANDO #aceptarcarrera ===================
    else if (command === 'aceptarcarrera') {
      if (!chat.retoPendiente) return m.reply('ꕥ No hay retos pendientes.')

      const reto = chat.retoPendiente

      // Resolver quién acepta — igual que el retador, usar participantAlt primero
      const senderRaw = m.sender || m.key?.participant || m.key?.remoteJid
      const senderAlt = m.key?.participantAlt
      let quienAcepta = senderAlt?.endsWith('@s.whatsapp.net') ? senderAlt
                      : await toPN(senderRaw, client, m.chat)

      // Validar: ¿quienAcepta es el oponente del reto?
      const esValido = sameUser(quienAcepta, reto.oponente) ||
                       sameUser(quienAcepta, reto.rawOponente) ||
                       sameUser(senderRaw,   reto.oponente) ||
                       sameUser(senderRaw,   reto.rawOponente)

      if (!esValido) {
        const nombreOponente =
          global.db.data.users[reto.oponente]?.name ||
          reto.oponente.split('@')[0]
        return m.reply(`ꕥ Solo *${nombreOponente}* puede aceptar este reto.`)
      }

      if (reto.expiracion < Date.now()) {
        if (chat.users[reto.retador]) chat.users[reto.retador].coins += reto.apuesta
        delete chat.retoPendiente
        return m.reply('ꕥ El reto expiró.')
      }

      if (!chat.users[quienAcepta]) chat.users[quienAcepta] = { coins: 0 }
      if (chat.users[quienAcepta].coins < reto.apuesta) return m.reply(`ꕥ No tienes suficientes ${monedas}.`)

      chat.users[quienAcepta].coins -= reto.apuesta
      if (global.carreraTimeouts[m.chat]) clearTimeout(global.carreraTimeouts[m.chat])
      delete chat.retoPendiente

      await iniciarCarrera(client, m.chat, quienAcepta, reto, monedas, global.db.data)
    }
  }
}

async function iniciarCarrera(client, chatId, oponenteId, reto, monedas, dbData) {
  const chat = dbData.chats[chatId]
  const retadorId = reto.retador
  const premio = reto.apuesta * 2

  const nRetador = dbData.users[retadorId]?.name || retadorId.split('@')[0]
  const nOponente = dbData.users[oponenteId]?.name || oponenteId.split('@')[0]

  const carrera = {
    jugadores: [
      { id: retadorId, nombre: nRetador, pos: 0 },
      { id: oponenteId, nombre: nOponente, pos: 0 }
    ],
    meta: 15,
    msgId: null
  }
  chat.carreraActiva = true

  const buildPista = () => {
    return carrera.jugadores.map(j => {
      const p = j.pos >= carrera.meta
        ? '-'.repeat(carrera.meta) + '🐎🏁'
        : '-'.repeat(j.pos) + '🐎' + '-'.repeat(carrera.meta - j.pos - 1) + '🏁'
      return `❏ ${j.nombre}\n  ${p}`
    }).join('\n\n')
  }

  const { key } = await client.sendMessage(chatId, {
    text: `「✿」 *CARRERA INICIADA*\n\n${buildPista()}\n\n❏ Premio: *${premio} ${monedas}*`
  })
  carrera.msgId = key.id

  const intervalo = setInterval(async () => {
    carrera.jugadores.forEach(j => j.pos += Math.floor(Math.random() * 3) + 1)
    const ganador = carrera.jugadores.find(j => j.pos >= carrera.meta)

    if (ganador) {
      clearInterval(intervalo)
      dbData.chats[chatId].users[ganador.id].coins += premio
      const finalMsg = `「✿」 *CARRERA FINALIZADA*\n\n${buildPista()}\n\n❏ Ganador: @${ganador.id.split('@')[0]}\n❏ Premio: +${premio} ${monedas}`
      await client.sendMessage(chatId, { text: finalMsg, edit: key, mentions: [ganador.id] })
      delete chat.carreraActiva
    } else {
      await client.sendMessage(chatId, {
        text: `「✿」 *CARRERA*\n\n${buildPista()}\n\n❏ Premio: *${premio} ${monedas}*`,
        edit: key
      })
    }
  }, 2500)
}
