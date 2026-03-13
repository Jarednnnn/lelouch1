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
  run: async (client, m, args, usedPrefix, command) => {
    const chat = global.db.data.chats[m.chat]
    const user = chat.users[m.sender]
    const botId = client.user.id.split(':')[0] + '@s.whatsapp.net'
    const botSettings = global.db.data.settings[botId]
    const monedas = botSettings.currency || 'Monedas'

    // Verificar si el comando está habilitado en el grupo
    if (chat.adminonly || !chat.rpg) {
      return m.reply(`ꕥ Los comandos de *RPG* están desactivados en este grupo.\n\nUn *administrador* puede activarlos con el comando:\n» *${usedPrefix}rpg on*`)
    }

    // Cooldown de 10 minutos
    const cooldown = 10 * 60 * 1000
    const now = Date.now()
    const remaining = (user.tradeCooldown || 0) - now

    if (remaining > 0) {
      return m.reply(`《✧》 Debes esperar *${msToTime(remaining)}* antes de invertir nuevamente.`)
    }

    // Parsear la cantidad (puede estar en cualquier argumento)
    let cantidad
    for (const arg of args) {
      const parsed = parseFloat(arg)
      if (!isNaN(parsed) && parsed > 0) {
        cantidad = parsed
        break
      }
    }

    if (!cantidad) {
      return m.reply(`ꕥ Debes ingresar una cantidad de *${monedas}* para invertir.\n> Ejemplo: *${usedPrefix + command} 500*`)
    }

    if (cantidad < 200) {
      return m.reply(`ꕥ La cantidad mínima para invertir es *200 ${monedas}*.`)
    }

    if (user.coins < cantidad) {
      return m.reply(`ꕥ No tienes suficientes *${monedas}* fuera del banco. Tienes *¥${user.coins.toLocaleString()} ${monedas}*.`)
    }

    // Generar tiempo de espera aleatorio (60-120 segundos)
    const tiempo = Math.floor(Math.random() * 60000) + 60000

    // Descontar la inversión y guardar datos temporales
    user.coins -= cantidad
    user.tradeCooldown = now + cooldown
    user.tradeEnd = now + tiempo
    user.tradeAmount = cantidad

    m.reply(`《✧》 Inversión iniciada con *¥${cantidad.toLocaleString()} ${monedas}*. Resultado en *${msToTime(tiempo)}*.`)

    // Programar el resultado
    setTimeout(async () => {
      const multiplicador = Math.floor(Math.random() * 16) // 0 a 15
      let recompensa = 0
      let mensaje = ''

      if (multiplicador >= 5) {
        recompensa = cantidad * multiplicador
        mensaje = `ꕥ Movimiento alcista x${multiplicador}. Ganancia total: *¥${recompensa.toLocaleString()} ${monedas}*.`
      } else {
        recompensa = 0
        mensaje = `✎ La operación fue liquidada. Perdiste *¥${cantidad.toLocaleString()} ${monedas}*.`
      }

      // Sumar ganancia (si la hay)
      user.coins += recompensa

      // Registrar historial
      if (!user.tradeHistory) user.tradeHistory = []
      user.tradeHistory.push({
        amount: cantidad,
        reward: recompensa,
        multiplier: multiplicador,
        time: Date.now()
      })
      if (user.tradeHistory.length > 10) user.tradeHistory.shift()

      user.tradeEnd = 0

      // Enviar resultado mencionando al usuario
      await client.sendMessage(m.chat, {
        text: mensaje,
        mentions: [m.sender]
      }, { quoted: m })
    }, tiempo)
  },
}
