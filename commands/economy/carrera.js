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

    // --- FUNCIÓN PARA EXTRAER NÚMERO DE TELÉFONO DEL TEXTO ---
    const extraerNumeroDeTexto = (texto) => {
      if (!texto) return null
      const match = texto.match(/[\+\d][\d\s\-\(\)]{7,}/g)
      if (match) {
        return match[0].replace(/\D/g, '')
      }
      return null
    }

    // --- FUNCIÓN PARA OBTENER JID REAL DE FORMA SEGURA ---
    const obtenerJidReal = async (id, textoCompleto, grupoId) => {
      if (!id) return null
      if (id.endsWith('@s.whatsapp.net')) return id

      let jid = await resolveLidToRealJid(id, client, grupoId)
      if (jid && jid.endsWith('@s.whatsapp.net')) return jid

      const numero = extraerNumeroDeTexto(textoCompleto)
      if (numero && numero.length >= 10) return numero + '@s.whatsapp.net'

      const idLimpio = id.replace(/\D/g, '')
      if (idLimpio.length >= 10) return idLimpio + '@s.whatsapp.net'

      return null
    }

    // --- FUNCIÓN PARA OBTENER NOMBRE LEGIBLE ---
    const obtenerNombre = (jid) => {
      if (!jid) return 'Desconocido'
      const nombreDB = global.db.data.users[jid]?.name
      if (nombreDB) return nombreDB
      const numero = jid.split('@')[0]
      if (numero.length >= 10) {
        return numero.replace(/(\d{2})(\d{3})(\d{3})(\d{4})/, '+$1 $2 $3 $4')
      }
      return numero
    }

    // =================== COMANDO #carrera ===================
    if (command === 'carrera') {
      if (chat.carreraActiva) return m.reply('ꕥ Ya hay una carrera en curso.')

      const mentionedJid = m.mentionedJid
      const rawOpponent = mentionedJid?.[0] || m.quoted?.sender
      if (!rawOpponent) return m.reply(`ꕥ Menciona a alguien.\n> Ejemplo: *${usedPrefix}carrera @usuario 200*`)

      const textoCompleto = m.text

      const retador = await obtenerJidReal(m.sender, textoCompleto, m.chat)
      const oponente = await obtenerJidReal(rawOpponent, textoCompleto, m.chat)

      if (!retador || !oponente) return m.reply('ꕥ No se pudo identificar a los participantes.')
      if (retador === oponente) return m.reply('ꕥ No puedes jugar contra ti mismo.')

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

      chat.users[retador].coins -= apuesta
      chat.retoPendiente = { retador, oponente, apuesta, expiracion: Date.now() + 60000 }

      global.carreraTimeouts[m.chat] = setTimeout(() => {
        if (chat.retoPendiente && chat.retoPendiente.retador === retador) {
          if (chat.users[retador]) chat.users[retador].coins += apuesta
          delete chat.retoPendiente
          client.sendMessage(m.chat, { text: 'ꕥ El reto ha expirado.' })
        }
      }, 60000)

      const nRetador = obtenerNombre(retador)
      const nOponente = obtenerNombre(oponente)

      const mensaje = `「✿」 *${nRetador}*, ¿confirmas retar a *${nOponente}*?\n\n❏ Apuesta: *${apuesta} ${monedas}* cada uno\n\n✐ Para aceptar escribe *${usedPrefix}aceptarcarrera*\n❏ Expira en: 60 segundos`
      await client.sendMessage(m.chat, { text: mensaje, mentions: [retador, oponente] }, { quoted: m })
    }

    // =================== COMANDO #aceptarcarrera ===================
    else if (command === 'aceptarcarrera') {
      if (!chat.retoPendiente) return m.reply('ꕥ No hay retos pendientes.')

      const quienAcepta = await obtenerJidReal(m.sender, m.text, m.chat)
      const reto = chat.retoPendiente

      // Verificación: solo el oponente puede aceptar
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

  const obtenerNombre = (jid) => {
    if (!jid) return 'Desconocido'
    const nombreDB = dbData.users[jid]?.name
    if (nombreDB) return nombreDB
    const numero = jid.split('@')[0]
    if (numero.length >= 10) {
      return numero.replace(/(\d{2})(\d{3})(\d{3})(\d{4})/, '+$1 $2 $3 $4')
    }
    return numero
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
    // Movimiento aleatorio para cada jugador (1-3 pasos)
    carrera.jugadores.forEach(j => j.pos += Math.floor(Math.random() * 3) + 1)
    
    // Verificar si ambos llegaron o pasaron la meta en el mismo turno
    const jugadoresMeta = carrera.jugadores.filter(j => j.pos >= carrera.meta)
    
    if (jugadoresMeta.length >= 2) {
      // Empate: ambos llegaron en el mismo turno
      clearInterval(intervalo)
      // Devolver apuestas a ambos
      dbData.chats[chatId].users[retadorId].coins += reto.apuesta
      dbData.chats[chatId].users[oponenteId].coins += reto.apuesta
      const empateMsg = `「✿」 *CARRERA EMPATADA*\n\n${buildPista()}\n\n❏ Resultado: ¡Empate! Ambos llegaron a la meta.\n❏ Se devuelven las apuestas: *${reto.apuesta} ${monedas}* cada uno.`
      await client.sendMessage(chatId, { text: empateMsg, edit: key })
      delete chat.carreraActiva
    } 
    else if (jugadoresMeta.length === 1) {
      // Hay un ganador único
      clearInterval(intervalo)
      const ganador = jugadoresMeta[0]
      dbData.chats[chatId].users[ganador.id].coins += premio
      const finalMsg = `「✿」 *CARRERA FINALIZADA*\n\n${buildPista()}\n\n❏ Ganador: @${ganador.id.split('@')[0]}\n❏ Premio: +${premio} ${monedas}`
      await client.sendMessage(chatId, { text: finalMsg, edit: key, mentions: [ganador.id] })
      delete chat.carreraActiva
    } 
    else {
      // Nadie ha llegado, actualizar pista
      await client.sendMessage(chatId, { text: `「✿」 *CARRERA*\n\n${buildPista()}\n\n❏ Premio: *${premio} ${monedas}*`, edit: key })
    }
  }, 2500)
}
