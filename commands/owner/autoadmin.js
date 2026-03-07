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
      // Obtener metadatos del grupo
      const groupMetadata = await client.groupMetadata(chatId)
      
      // Número del bot (sin dominio y sin :XX)
      const botNumber = client.user.id.split(':')[0].split('@')[0] + '@s.whatsapp.net'
      
      // Variables para almacenar resultados
      let botIsAdmin = false
      let userIsAdmin = false
      
      // Recorrer participantes resolviendo LIDs
      for (const participant of groupMetadata.participants) {
        const realId = await resolveLidToRealJid(participant.id, client, chatId)
        
        // Verificar si es el bot
        if (realId === botNumber) {
          botIsAdmin = !!participant.admin
        }
        
        // Verificar si es el usuario que ejecuta el comando
        if (realId === sender) {
          userIsAdmin = !!participant.admin
        }
        
        // Si ya encontramos ambos, podemos romper el ciclo
        if (botIsAdmin !== undefined && userIsAdmin !== undefined) break
      }
      
      // Log en consola para depuración
      console.log('╭────────────────────────────···')
      console.log(`│ Grupo: ${groupMetadata.subject || 'sin nombre'} (${chatId})`)
      console.log(`│ Bot número: ${botNumber}`)
      console.log(`│ Bot admin: ${botIsAdmin ? 'SÍ' : 'NO'}`)
      console.log('╰────────────────────────────···')
      
      // Verificar que el bot sea admin
      if (!botIsAdmin) {
        console.log(`❌ El bot NO es admin en este grupo.`)
        return m.reply('《✧》 El bot no es administrador en este grupo. No puedo ejecutar el comando.')
      }
      
      console.log(`✅ El bot SÍ es admin en este grupo. Continuando...`)
      
      // Verificar si el usuario ya es admin
      if (userIsAdmin) {
        console.log(`ℹ️ El usuario ya es admin.`)
        return client.sendMessage(m.chat, { 
          text: `Usted ya tiene admin, mi señor.`, 
          mentions: [sender] 
        }, { quoted: m })
      }
      
      // Proceder a promover
      console.log(`🚀 Promoviendo a ${sender}...`)
      await client.groupParticipantsUpdate(m.chat, [sender], 'promote')
      
      console.log(`✅ Promoción exitosa.`)
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
