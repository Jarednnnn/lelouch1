import { resolveLidToRealJid } from "../../lib/utils.js"

export default {
  command: ['fixadmin'],
  category: 'owner',
  isOwner: true,
  run: async (client, m, args) => {
    const chatId = m.chat
    const sender = m.sender

    try {
      await m.reply('🔄 Intentando refrescar metadata del grupo...')

      // Estrategia 1: Obtener metadata forzando actualización (si la librería lo soporta)
      let groupMetadata
      try {
        // Algunas librerías aceptan { cached: false }
        groupMetadata = await client.groupMetadata(chatId, { cached: false })
      } catch {
        // Si no, obtenemos normal
        groupMetadata = await client.groupMetadata(chatId)
      }

      // Estrategia 2: Si aún no se actualiza, enviamos un mensaje temporal para forzar refresh
      const tempMsg = await client.sendMessage(chatId, { text: '⚡ Refrescando metadatos...' })
      // Pequeña pausa para que WhatsApp procese
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // Volvemos a obtener metadata
      groupMetadata = await client.groupMetadata(chatId)
      
      // Eliminar mensaje temporal
      await client.sendMessage(chatId, { delete: tempMsg.key })

      // Ahora verificamos los participantes
      let participantes = []
      for (const p of groupMetadata.participants) {
        const realId = await resolveLidToRealJid(p.id, client, chatId)
        participantes.push({
          original: p.id,
          realId,
          admin: p.admin || null
        })
      }

      // Buscar al usuario actual
      const userData = participantes.find(p => p.realId === sender)
      
      let respuesta = `🔍 *RESULTADO FIXADMIN*\n\n`
      respuesta += `• Grupo: ${groupMetadata.subject}\n`
      respuesta += `• Total participantes: ${participantes.length}\n\n`
      
      if (userData) {
        respuesta += `*Tus datos:*\n`
        respuesta += `- ID original: ${userData.original}\n`
        respuesta += `- ID real: ${userData.realId}\n`
        respuesta += `- Admin según API: ${userData.admin ? 'SÍ' : 'NO'}\n`
        respuesta += `- Valor raw: ${JSON.stringify(userData.admin)}\n\n`
      } else {
        respuesta += `❌ No se encontró tu ID en los participantes.\n\n`
      }

      respuesta += `*Primeros 5 participantes:*\n`
      participantes.slice(0, 5).forEach((p, i) => {
        respuesta += `${i+1}. ${p.realId} → admin: ${p.admin ? '✅' : '❌'}\n`
      })

      await client.sendMessage(chatId, { text: respuesta }, { quoted: m })

    } catch (e) {
      console.error('Error en fixadmin:', e)
      m.reply(`Error: ${e.message}`)
    }
  }
}
