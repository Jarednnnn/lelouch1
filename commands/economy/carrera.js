export default {
  command: 'race',
  category: 'economy',
  run: async (client, m, args, usedPrefix, command) => {
    const chatId = m.chat
    const userId = m.sender
    const db = global.db.data
    const chat = db.chats[chatId] = db.chats[chatId] || {}
    const user = chat.users = chat.users || {}
    const userData = user[userId] = user[userId] || { coins: 0 }
    const botId = client.user.id.split(':')[0] + '@s.whatsapp.net'
    const botSettings = db.settings && db.settings[botId] ? db.settings[botId] : {}
    const monedas = botSettings.currency || 'coins'

    // Verificar economía activada
    if (chat.adminonly || !chat.economy) {
      return m.reply(`ꕥ Los comandos de *Economía* están desactivados en este grupo.\n\nUn *administrador* puede activarlos con el comando:\n» *${usedPrefix}economy on*`)
    }

    // Verificar que no haya carrera activa
    if (chat.carreraActiva) {
      return m.reply('ꕥ Ya hay una carrera en curso en este grupo. Espera a que termine.')
    }

    // Verificar mención
    const mentioned = m.message && m.message.extendedTextMessage && m.message.extendedTextMessage.contextInfo && m.message.extendedTextMessage.contextInfo.mentionedJid
    if (!mentioned || mentioned.length === 0) {
      return m.reply(`ꕥ Debes mencionar al usuario con quien quieres competir.\n> Ejemplo: *${usedPrefix}carrera @usuario 200*`)
    }
    const opponentId = mentioned[0]
    if (opponentId === userId) {
      return m.reply('ꕥ No puedes retarte a ti mismo. Menciona a otro usuario.')
    }

    // Inicializar oponente si no existe
    user[opponentId] = user[opponentId] || { coins: 0 }

    // Obtener apuesta
    const apuesta = parseInt(args[0])
    if (isNaN(apuesta) || apuesta < 100) {
      return m.reply(`ꕥ Apuesta inválida. Debe ser un número mayor o igual a 100 ${monedas}.`)
    }

    // Verificar fondos del retador
    if (userData.coins < apuesta) {
      return m.reply(`ꕥ No tienes suficientes ${monedas}. Necesitas *${apuesta} ${monedas}*.`)
    }

    // Verificar reto pendiente previo
    if (chat.retoPendiente) {
      if (chat.retoPendiente.expiracion < Date.now()) {
        // Devolver fondos al retador anterior
        const retadorAnterior = chat.retoPendiente.retador
        if (retadorAnterior && user[retadorAnterior]) {
          user[retadorAnterior].coins += chat.retoPendiente.apuestaRetador
        }
        delete chat.retoPendiente
      } else {
        return m.reply('ꕥ Ya hay un reto pendiente en este grupo. Espera a que sea aceptado o expire.')
      }
    }

    // Restar apuesta al retador
    userData.coins -= apuesta

    // Crear reto pendiente
    const reto = {
      retador: userId,
      oponente: opponentId,
      apuestaRetador: apuesta,
      expiracion: Date.now() + 60000 // 60 segundos
    }
    chat.retoPendiente = reto

    // Programar expiración
    const timeout = setTimeout(() => {
      if (chat.retoPendiente && chat.retoPendiente.retador === userId) {
        // Devolver fondos al retador
        if (user[userId]) {
          user[userId].coins += apuesta
        }
        delete chat.retoPendiente
        client.sendMessage(chatId, { text: '⏳ El reto de carrera ha expirado por falta de respuesta.' })
      }
    }, 60000)
    chat.retoPendiente.timeout = timeout

    // Obtener nombres
    const retadorName = (db.users && db.users[userId] && db.users[userId].name) || userId.split('@')[0]
    const oponenteName = (db.users && db.users[opponentId] && db.users[opponentId].name) || opponentId.split('@')[0]

    // Enviar mensaje de reto
    const mensajeReto = `╭┈ࠢ͜┅ࠦ͜͜╾݊͜─ׄ͜─֬͜─֟͜─֫͜─ׄ͜─݊͜┅ࠡ͜͜┈࠭͜
│        𐔌 RETO DE CARRERA 𐦯
│
│ 🐎 *${retadorName}* reta a *${oponenteName}*
│
│ Apuesta: *${apuesta} ${monedas}* cada uno
│
│ Para aceptar, escribe:
│ *${usedPrefix}aceptarcarrera*
│
│ Este reto expirará en 60 segundos.
╰┈ࠢ͜─ׄ͜─ׄ͜─ׄ͜─ׄ͜─ׄ͜─ׄ͜─ׄ͜─ׄ͜┈ࠢ͜╯`
    await client.sendMessage(chatId, { text: mensajeReto }, { quoted: m })
  }
}
