export default {
  command: ['autoadmin'],
  category: 'grupo',
  isOwner: true,
  botAdmin: true,
  run: async (client, m, args, usedPrefix, command) => {
    const sender = m.sender
    try {
      // Obtener metadatos del grupo (sin caché)
      const groupMetadata = await client.groupMetadata(m.chat)
      
      // Normalizar ID del bot (quitar posible :XX y asegurar dominio)
      const botIdRaw = client.user.id.split(':')[0]
      const botId = botIdRaw.includes('@') ? botIdRaw : botIdRaw + '@s.whatsapp.net'
      
      // Buscar al bot en la lista de participantes
      const botParticipant = groupMetadata.participants.find(p => 
        p.id === botId || p.id.split('@')[0] === botId.split('@')[0]
      )
      
      // Verificar que el bot sea admin
      if (!botParticipant || !botParticipant.admin) {
        return m.reply('《✧》 El bot no es administrador en este grupo. No puedo ejecutar el comando.')
      }
      
      // Buscar al usuario que ejecuta el comando (el owner)
      const userParticipant = groupMetadata.participants.find(p => 
        p.id === sender || p.id.split('@')[0] === sender.split('@')[0]
      )
      
      // Si ya es admin, avisar
      if (userParticipant?.admin) {
        return client.sendMessage(m.chat, { 
          text: `Usted ya tiene admin, mi señor.`, 
          mentions: [sender] 
        }, { quoted: m })
      }
      
      // Proceder a promover
      await client.groupParticipantsUpdate(m.chat, [sender], 'promote')
      
      // Confirmación
      await client.sendMessage(m.chat, { 
        text: `A sus órdenes, @${sender.split('@')[0]}`, 
        mentions: [sender] 
      }, { quoted: m })
      
    } catch (e) {
      console.error('Error en autoadmin:', e)
      await m.reply(`> Ocurrió un error al ejecutar el comando *${usedPrefix + command}*.\n> [Error: *${e.message}*]\n> Por favor, intente de nuevo o contacte a soporte.`)
    }
  }
}
