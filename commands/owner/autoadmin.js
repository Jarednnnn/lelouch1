import { resolveLidToRealJid } from "../../lib/utils.js"

export default {
  command: ['autoadmin'],
  category: 'grupo',
  isOwner: true,
  botAdmin: true,
  run: async (client, m, args, usedPrefix, command) => {
    const sender = m.sender
    const chatId = m.chat
    try {
      const groupMetadata = await client.groupMetadata(chatId)
      const botNumberRaw = client.user.id.split(':')[0].split('@')[0]
      const botNumber = botNumberRaw + '@s.whatsapp.net'
      
      console.log('╭────────────────────────────···')
      console.log(`│ Grupo: ${groupMetadata.subject || 'sin nombre'} (${chatId})`)
      console.log(`│ Bot número: ${botNumber}`)
      console.log(`│ Participantes:`)
      
      let botIsAdmin = false
      let userIsAdmin = false
      
      for (const participant of groupMetadata.participants) {
        const realId = await resolveLidToRealJid(participant.id, client, chatId)
        console.log(`│   - ID original: ${participant.id}, admin: ${participant.admin}, realId: ${realId}`)
        
        if (realId === botNumber) {
          botIsAdmin = !!participant.admin
          console.log(`│     → ¡Es el bot! admin: ${participant.admin}`)
        }
        if (realId === sender) {
          userIsAdmin = !!participant.admin
          console.log(`│     → ¡Es el usuario! admin: ${participant.admin}`)
        }
      }
      
      console.log(`│ Bot admin: ${botIsAdmin ? 'SÍ' : 'NO'}`)
      console.log('╰────────────────────────────···')
      
      if (!botIsAdmin) {
        return m.reply('《✧》 El bot no es administrador en este grupo. No puedo ejecutar el comando.')
      }
      
      if (userIsAdmin) {
        return client.sendMessage(m.chat, { 
          text: `Usted ya tiene admin, mi señor.`, 
          mentions: [sender] 
        }, { quoted: m })
      }
      
      await client.groupParticipantsUpdate(m.chat, [sender], 'promote')
      
      await client.sendMessage(m.chat, { 
        text: `A sus órdenes, @${sender.split('@')[0]}`, 
        mentions: [sender] 
      }, { quoted: m })
      
    } catch (e) {
      console.error(`❌ Error en autoadmin:`, e)
      await m.reply(`> Ocurrió un error al ejecutar el comando *${usedPrefix + command}*.\n> [Error: *${e.message}*]\n> Por favor, intente de nuevo o contacte a soporte.`)
    }
  }
}
