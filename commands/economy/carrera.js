// Almacén global de timeouts e intervalos
global.carreraTimeouts = global.carreraTimeouts || {}
global.carreraIntervalos = global.carreraIntervalos || {}
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

      const mensaje = `╭┈ࠢ͜┅ࠦ͜͜
│ 𐔌 RETO DE CARRERA
│
│ 🐎 ${nRetador} reta a ${nOponente}
│
│ Apuesta: ${apuesta} ${monedas}
│
│ Para aceptar:
│ ${usedPrefix}aceptarcarrera
│
│ Expira en 60s
╰────────────`

      await client.sendMessage(m.chat, { text: mensaje, mentions: [retador, oponente] }, { quoted: m })
    }

    // =================== COMANDO #aceptarcarrera ===================
    else if (command === 'aceptarcarrera') {
      if (!chat.retoPendiente) return m.reply('ꕥ No hay ningún reto pendiente.')

      const quienAcepta = await obtenerJidReal(m.sender, m.text, m.chat)
      const reto = chat.retoPendiente

      if (quienAcepta !== reto.oponente) {
        const nombreOponente = obtenerNombre(reto.oponente)
        return m.reply(`ꕥ Solo ${nombreOponente} puede aceptar.`)
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

      await iniciarCarrera(client, m.chat, reto, monedas, global.db.data)
    }
  }
}

async function iniciarCarrera(client, chatId, reto, monedas, dbData) {
  const chat = dbData.chats[chatId]
  const retadorId = reto.retador
  const oponenteId = reto.oponente
  const apuesta = reto.apuesta
  const premio = apuesta * 2

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

  const meta = 15
  let jugadores = [
    { id: retadorId, nombre: nRetador, pos: 0 },
    { id: oponenteId, nombre: nOponente, pos: 0 }
  ]

  const buildPista = () => {
    return jugadores.map(j => {
      if (j.pos >= meta) {
        return `${j.nombre}\n${'-'.repeat(meta)}🐎🏁`
      }
      return `${j.nombre}\n${'-'.repeat(j.pos)}🐎${'-'.repeat(meta - j.pos - 1)}🏁`
    }).join('\n\n')
  }

  const textoInicial = `╭┈ࠢ͜┅ࠦ͜͜
│ 𐔌 CARRERA INICIADA
│
${buildPista()}
│
│ Premio: ${premio} ${monedas}
╰────────────`

  const { key } = await client.sendMessage(chatId, { text: textoInicial })
  chat.carreraActiva = true

  const intervalo = setInterval(async () => {
    jugadores.forEach(j => {
      if (j.pos < meta) {
        j.pos += Math.floor(Math.random() * 3) + 1
      }
    })

    const jugadoresEnMeta = jugadores.filter(j => j.pos >= meta)

    if (jugadoresEnMeta.length === 2) {
      clearInterval(intervalo)
      chat.carreraActiva = false

      chat.users[retadorId].coins += apuesta
      chat.users[oponenteId].coins += apuesta

      const textoEmpate = `╭┈ࠢ͜┅ࠦ͜͜
│ 𐔌 EMPATE
│
${buildPista()}
│
│ ❏ Se devuelven ${apuesta} ${monedas} a cada uno.
╰────────────`

      await client.sendMessage(chatId, { text: textoEmpate, edit: key })
      return
    }

    if (jugadoresEnMeta.length === 1) {
      clearInterval(intervalo)
      chat.carreraActiva = false

      const ganador = jugadoresEnMeta[0]
      chat.users[ganador.id].coins += premio

      const textoGanador = `╭┈ࠢ͜┅ࠦ͜͜
│ 𐔌 CARRERA FINALIZADA
│
${buildPista()}
│
│ 𐔌 Ganador: @${ganador.id.split('@')[0]}
│ Premio: +${premio} ${monedas}
╰────────────`

      await client.sendMessage(chatId, { text: textoGanador, edit: key, mentions: [ganador.id] })
      return
    }

    const textoActualizado = `╭┈ࠢ͜┅ࠦ͜͜
│ 𐔌 CARRERA
│
${buildPista()}
│
│ Premio: ${premio} ${monedas}
╰────────────`

    await client.sendMessage(chatId, { text: textoActualizado, edit: key })
  }, 2000)

  global.carreraIntervalos[chatId] = intervalo
}
