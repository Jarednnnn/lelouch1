import { resolveLidToRealJid } from "../../lib/utils.js"

export default {
  command: ['bot'],
  category: 'grupo',
  run: async (client, m, args) => {
    const chat = global.db.data.chats[m.chat]
    const estado = chat.isBanned ?? false
    const sender = m.sender
    const chatId = m.chat
    const senderNumber = sender.split('@')[0]

    try {
      console.log('\n=== DEBUG COMPLETO #bot ===')
      console.log('Sender:', sender)
      console.log('Chat:', chatId)
      
      const groupMetadata = await client.groupMetadata(chatId)
      console.log(`Total participantes: ${groupMetadata.participants.length}`)
      
      // Mostrar todos los participantes con su rol
      let foundUser = false
      for (const p of groupMetadata.participants) {
        const realId = await resolveLidToRealJid(p.id, client, chatId)
        const esSender = (realId === sender || realId.split('@')[0] === senderNumber)
        console.log(`- ID: ${p.id}, realId: ${realId}, admin raw: ${p.admin}, admin tipo: ${typeof p.admin}, esSender: ${esSender}`)
        
        if (esSender) {
          foundUser = true
          console.log(`  → USUARIO ENCONTRADO con admin = ${p.admin}`)
        }
      }
      
      if (!foundUser) {
        console.log('¡No se encontró al sender en la lista!')
        return m.reply('No se pudo verificar tu membresía.')
      }
      
      // Ahora proceder con la verificación real
      let userIsAdmin = false
      for (const participant of groupMetadata.participants) {
        const realId = await resolveLidToRealJid(participant.id, client, chatId)
        if (realId === sender || realId.split('@')[0] === senderNumber) {
          userIsAdmin = !!participant.admin // Convertir a booleano
          console.log(`→ Verificación final: admin booleano = ${userIsAdmin}`)
          break
        }
      }
      
      console.log('Resultado final userIsAdmin:', userIsAdmin)
      
      if (!userIsAdmin) {
        return m.reply('《✧》 Solo los administradores del grupo pueden usar este comando.')
      }
      
      // Resto del comando...
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
      console.error('Error:', e)
      return m.reply('Ocurrió un error.')
    }
  }
}
