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

    // --- FUNCIÓN PARA EXTRAER NÚMERO DE TELÉFONO DEL TEXTO (ej: +58 426-6546654) ---
    const extraerNumeroDeTexto = (texto) => {
      if (!texto) return null
      // Busca un patrón de número de teléfono: puede tener +, espacios, guiones
      const match = texto.match(/[\+\d][\d\s\-\(\)]{7,}/g)
      if (match) {
        // Toma el primero y elimina todo excepto dígitos
        return match[0].replace(/\D/g, '')
      }
      return null
    }

    // --- FUNCIÓN PARA OBTENER JID REAL DE FORMA SEGURA ---
    const obtenerJidReal = async (id, textoCompleto, grupoId) => {
      if (!id) return null
      
      // Si ya es un JID válido, lo devolvemos
      if (id.endsWith('@s.whatsapp.net')) return id

      // 1. Intentar con resolveLidToRealJid
      let jid = await resolveLidToRealJid(id, client, grupoId)
      if (jid && jid.endsWith('@s.whatsapp.net')) return jid

      // 2. Si falla, intentar extraer número del texto original
      const numero = extraerNumeroDeTexto(textoCompleto)
      if (numero) {
        const jidConstruido = numero + '@s.whatsapp.net'
        // Verificar que el número sea plausible (longitud mínima)
        if (numero.length >= 10) return jidConstruido
      }

      // 3. Último recurso: construir a partir del ID (quitando todo no numérico)
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
      // Formato: +58 426 654 6654 (ajusta según tu país)
      if (numero.length >= 10) {
        return numero.replace(/(\d{2})(\d{3})(\d{3})(\d{4})/, '+$1 $2 $3 $4')
      }
      return numero
    }

    // =================== COMANDO #carrera ===================
    if (command === 'carrera') {
      if (chat.carreraActiva) return m.reply('ꕥ Ya hay una carrera en curso.')

      // Obtener mencionado o citado
      const mentionedJid = m.mentionedJid
      const rawOpponent = mentionedJid?.[0] || m.quoted?.sender
      if (!rawOpponent) return m.reply(`ꕥ Menciona a alguien.\n> Ejemplo: *${usedPrefix}carrera @usuario 200*`)

      // El texto completo del mensaje (para extraer número si es necesario)
      const textoCompleto = m.text

      // Obtener JID real del retador y oponente
      const retador = await obtenerJidReal(m.sender, textoCompleto, m.chat)
      const oponente = await obtenerJidReal(rawOpponent, textoCompleto, m.chat)

      if (!retador || !oponente) return m.reply('ꕥ No se pudo identificar a los participantes.')
      if (retador === oponente) return m.reply('ꕥ No puedes jugar contra ti mismo.')

      // Extraer apuesta (el último argumento numérico)
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

      // Obtener nombres para mostrar
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
      const quienAcepta = await obtenerJidReal(m.sender, m.text, m.chat)
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
