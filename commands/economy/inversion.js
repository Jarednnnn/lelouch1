const msToTime = (duration) => {
  const seconds = Math.floor((duration / 1000) % 60)
  const minutes = Math.floor((duration / (1000 * 60)) % 60)

  const pad = (n) => n.toString().padStart(2, '0')
  if (minutes === 0) return `${pad(seconds)} segundo${seconds !== 1 ? 's' : ''}`
  return `${pad(minutes)} minuto${minutes !== 1 ? 's' : ''}, ${pad(seconds)} segundo${seconds !== 1 ? 's' : ''}`
}

export default {
  command: ['invertir', 'trading'],
  category: 'rpg',
  run: async (client, m, args, command, text, prefix) => {
    const chat = global.db.data.chats[m.chat]
    const user = chat.users[m.sender]
    const botId = client.user.id.split(':')[0] + '@s.whatsapp.net'
    const currency = global.db.data.settings[botId]?.currency || 'Monedas'

    // Verificación igual a la de dungeon
    if (chat.adminonly || !chat.rpg) {
      return m.reply(mess.comandooff)
    }

    // Cooldown de 10 minutos (estilo dungeon)
    const cooldownTime = 10 * 60 * 1000
    const now = Date.now()
    if (user.tradeCooldown && now < user.tradeCooldown) {
      const restante = user.tradeCooldown - now
      return m.reply(`《✧》 Debes esperar *${msToTime(restante)}* antes de invertir nuevamente.`)
    }

    // Parsear la cantidad (primer número positivo)
    let cantidad
    for (const arg of args) {
      const parsed = parseFloat(arg)
      if (!isNaN(parsed) && parsed > 0) {
        cantidad = parsed
        break
      }
    }

    if (!cantidad) {
      return m.reply(`ꕥ Debes ingresar una cantidad de *${currency}* para invertir.\n> Ejemplo: *${prefix + command} 500*`)
    }

    if (cantidad < 200) {
      return m.reply(`ꕥ La cantidad mínima para invertir es *200 ${currency}*.`)
    }

    // Asegurar que user.coins existe
    user.coins = user.coins || 0
    if (user.coins < cantidad) {
      return m.reply(`ꕥ No tienes suficientes *${currency}* fuera del banco. Tienes *¥${user.coins.toLocaleString()} ${currency}*.`)
    }

    // Tiempo de espera aleatorio (60-120 segundos)
    const tiempo = Math.floor(Math.random() * 60000) + 60000

    // Descontar la inversión y guardar datos temporales
    user.coins -= cantidad
    user.tradeCooldown = now + cooldownTime
    user.tradeEnd = now + tiempo
    user.tradeAmount = cantidad

    m.reply(`《✧》 Inversión iniciada con *¥${cantidad.toLocaleString()} ${currency}*. Resultado en *${msToTime(tiempo)}*.`)

    // Programar el resultado
    setTimeout(async () => {
      const multiplicador = Math.floor(Math.random() * 16) // 0 a 15
      let recompensa = 0
      let mensaje = ''

      if (multiplicador >= 5) {
        recompensa = cantidad * multiplicador
        mensaje = `ꕥ Movimiento alcista x${multiplicador}. Ganancia total: *¥${recompensa.toLocaleString()} ${currency}*.`
      } else {
        mensaje = `✎ La operación fue liquidada. Perdiste *¥${cantidad.toLocaleString()} ${currency}*.`
      }

      // Sumar ganancia (si la hay)
      user.coins += recompensa

      // Registrar historial (como en dungeon se usa push sin verificar, pero aquí lo mantenemos)
      if (!user.tradeHistory) user.tradeHistory = []
      user.tradeHistory.push({
        amount: cantidad,
        reward: recompensa,
        multiplier: multiplicador,
        time: Date.now()
      })
      if (user.tradeHistory.length > 10) user.tradeHistory.shift()

      user.tradeEnd = 0

      // Enviar resultado mencionando al usuario (similar a dungeon pero con mención)
      await client.sendMessage(m.chat, {
        text: mensaje,
        mentions: [m.sender]
      }, { quoted: m })
    }, tiempo)
  },
}
