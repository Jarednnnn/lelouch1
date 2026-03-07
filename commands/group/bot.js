import { resolveLidToRealJid } from "../../lib/utils.js"

export default {
  command: ['bot'],
  category: 'grupo',
  run: async (client, m, args) => {
    const chat = global.db.data.chats[m.chat]
    const estado = chat.isBanned ?? false
    const sender = m.sender
    const chatId = m.chat

    try {
      // Verificar si el usuario es administrador del grupo
      const groupMetadata = await client.groupMetadata(chatId)
      let userIsAdmin = false

      for (const participant of groupMetadata.participants) {
        const realId = await resolveLidToRealJid(participant.id, client, chatId)
        if (realId === sender) {
          userIsAdmin = !!participant.admin
          break
        }
      }

      if (!userIsAdmin) {
        return m.reply('《✧》 Solo los administradores del grupo pueden usar este comando.')
      }

      // Resto del código original
      if (args[0] === 'off') {
        if (estado) return m.reply('《✧》 El *Bot* ya estaba *desactivado* en este grupo.')
        chat.isBanned = true
        return m.reply(`《✧》 Has *Desactivado* a *${global.db.data.settings[client.user.id.split(':')[0] + "@s.whatsapp.net"].namebot}* en este grupo.`)
      }

      if (args[0] === 'on') {
        if (!estado) return m.reply(`《✧》 *${global.db.data.settings[client.user.id.split(':')[0] + "@s.whatsapp.net"].namebot}* ya estaba *activado* en este grupo.`)
        chat.isBanned = false
        return m.reply(`《✧》 Has *Activado* a *${global.db.data.settings[client.user.id.split(':')[0] + "@s.whatsapp.net"].namebot}* en este grupo.`)
      }

      return m.reply(`*✿ Estado de ${global.db.data.settings[client.user.id.split(':')[0] + "@s.whatsapp.net"].namebot} (｡•́‿•̀｡)*\n✐ *Actual ›* ${estado ? '✗ Desactivado' : '✓ Activado'}\n\n✎ Puedes cambiarlo con:\n> ● _Activar ›_ *bot on*\n> ● _Desactivar ›_ *bot off*`)
    } catch (e) {
      console.error('Error en comando bot:', e)
      return m.reply('Ocurrió un error al ejecutar el comando.')
    }
  }
}
