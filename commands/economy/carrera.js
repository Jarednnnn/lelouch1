// Almacén global de timeouts
global.carreraTimeouts = global.carreraTimeouts || {}
import { resolveLidToRealJid } from '../../lib/utils.js'

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

    // --- FUNCIÓN PARA EXTRAER NÚMERO DE TELÉFONO DE UN ID O MENCIÓN ---
    const extraerNumero = (id) => {
      if (!id) return null
      // Si es un JID, extraemos la parte antes del @
      let parte = id.split('@')[0]
      // Eliminamos cualquier carácter no numérico (espacios, guiones, +)
      return parte.replace(/\D/g, '')
    }

    // --- FUNCIÓN PARA OBTENER UN JID REAL A PARTIR DE CUALQUIER FORMATO ---
    const obtenerJidReal = async (id, grupoId) => {
      if (!id) return null
      // Si ya es un JID válido, lo devolvemos
      if (id.endsWith('@s.whatsapp.net')) return id

      // Intentar resolver con la función de utils (puede devolver JID o LID)
      const resuelto = await resolveLidToRealJid(id, client, grupoId)
      if (resuelto && resuelto.endsWith('@s.whatsapp.net')) return resuelto

      // Si no, extraemos el número y construimos un JID
      const numero = extraerNumero(id)
      if (numero) return numero + '@s.whatsapp.net'

      // Último recurso: devolver el original (probablemente cause error)
      return id
    }

    // --- FUNCIÓN PARA OBTENER NOMBRE LEGIBLE (con formato internacional) ---
    const obtenerNombre = (jid) => {
      if (!jid) return 'Desconocido'
      // Buscar en base de datos global
      const nombreDB = global.db.data.users[jid]?.name
      if (nombreDB) return nombreDB
      // Formatear el número: +58 426 654 6654 (ejemplo)
      const numero = jid.split('@')[0]
      // Agrupamos dígitos para que sea legible
      const formateado = numero.replace(/(\d{2})(\d{3})(\d{3})(\d{4})/, '+$1 $2 $3 $4')
      return formateado
    }

    // =================== COMANDO #carrera ===================
    if (command === 'carrera') {
      if (chat.carreraActiva) return m.reply('ꕥ Ya hay una carrera en curso.')

      // Obtener mencionado o citado
      const mentionedJid = m.mentionedJid
      const rawOpponent = mentionedJid?.[0] || m.quoted?.sender
      if (!rawOpponent) return m.reply(`ꕥ Menciona a alguien.\n> Ejemplo: *${usedPrefix}carrera @usuario 200*`)

      // Obtener JID real del retador y oponente
      const retador = await obtenerJidReal(m.sender, m.chat)
      const oponente = await obtenerJidReal(rawOpponent, m.chat)

      if (!oponente) return m.reply('ꕥ No se pudo identificar al oponente.')
      if (retador === oponente) return m.reply('ꕥ No puedes jugar contra ti mismo.')

      // Extraer apuesta
      let apuesta = parseInt(args.find(a => !isNaN(a.replace(/[,.]/g, '')) && parseInt(a.replace(/[,.]/g, '')) >= 100)?.replace(/[,.]/g, ''))
      if (!apuesta) return m.reply(`ꕥ Apuesta mínima: 100 ${monedas}.`)

      if (!chat.users[retador]) chat.users[retador] = { coins: 0 }
      if (chat.users[retador].coins < apuesta) return m.reply(`ꕥ No tienes suficientes ${monedas}.`)

      // Limpiar retos viejos
      if (chat.retoPendiente) {
        if (global.carreraTimeouts[m.chat]) clearTimeout(global.carreraTimeouts[m.chat])
        if (chat.retoPendiente.expiracion < Date.now()) {
          if (chat.users[chat.retoPendiente.retador]) chat.users[chat.retoPendiente.retador].coins += chat.retoPendiente.apuesta
          delete chat.retoPendiente
        } else return m.reply('ꕥ Hay un reto pendiente. Espera un momento.')
      }

      // Descontar monedas al retador y guardar reto (guardamos los JIDs reales)
      chat.users[retador].coins -= apuesta
      chat.retoPendiente = { retador, oponente, apuesta, expiracion: Date.now() + 60000 }

      // Timeout de expiración
      global.carreraTimeouts[m.chat] = setTimeout(() => {
        if (chat.retoPendiente && chat.retoPendiente.retador === retador) {
          if (chat.users[retador]) chat.users[retador].coins += apuesta
          delete chat.retoPendiente
          client.sendMessage(m.chat, { text: 'ꕥ El reto ha expirado.' })
        }
      }, 60000)

      // Obtener nombres para mostrar (usando los JIDs reales)
      const nRetador = obtenerNombre(retador)
      const nOponente = obtenerNombre(oponente)

      // Mensaje con decoración
      const mensaje = `「✿」 *${nRetador}*, ¿confirmas retar a *${nOponente}*?\n\n❏ Apuesta: *${apuesta} ${monedas}* cada uno\n\n✐ Para aceptar escribe *${usedPrefix}aceptarcarrera*\n⏳ Este reto expirará en 60 segundos.`
      await client.sendMessage(m.chat, { text: mensaje, mentions: [retador, oponente] }, { quoted: m })
    }

    // =================== COMANDO #aceptarcarrera ===================
    else if (command === 'aceptarcarrera') {
      if (!chat.retoPendiente) return m.reply('ꕥ No hay retos pendientes.')

      // Obtener JID real del que acepta
      const quienAcepta = await obtenerJidReal(m.sender, m.chat)
      const reto = chat.retoPendiente

      // Comparar directamente los JIDs reales
      if (quienAcepta !== reto.oponente) {
        const nombreOponente = obtenerNombre(reto.oponente)
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

  // Función para obtener nombre legible (reutilizada)
  const obtenerNombre = (jid) => {
    if (!jid) return 'Desconocido'
    const nombreDB = dbData.users[jid]?.name
    if (nombreDB) return nombreDB
    const numero = jid.split('@')[0]
    return numero.replace(/(\d{2})(\d{3})(\d{3})(\d{4})/, '+$1 $2 $3 $4')
  }

  const nRetador = obtenerNombre(retadorId)
  const nOponente = obtenerNombre(oponenteId)

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
      const p = j.pos >= carrera.meta ? '-'.repeat(carrera.meta) + '🐎🏁' : '-'.repeat(j.pos) + '🐎' + '-'.repeat(carrera.meta - j.pos - 1) + '🏁'
      return `❏ ${j.nombre}\n  ${p}`
    }).join('\n\n')
  }

  const { key } = await client.sendMessage(chatId, { text: `「✿」 *CARRERA INICIADA*\n\n${buildPista()}\n\n❏ Premio: *${premio} ${monedas}*` })
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
      await client.sendMessage(chatId, { text: `「✿」 *CARRERA*\n\n${buildPista()}\n\n❏ Premio: *${premio} ${monedas}*`, edit: key })
    }
  }, 2500)
}
