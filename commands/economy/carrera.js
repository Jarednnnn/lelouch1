export default {
  command: ['carrera', 'aceptarcarrera'],
  category: 'rpg',
  run: async (client, m, args, usedPrefix, command) => {
    const chatId = m.chat
    const userId = m.sender
    const db = global.db.data
    const chat = db.chats[chatId] ||= {}
    const user = chat.users?.[userId] ||= { coins: 0 }
    const botId = client.user.id.split(':')[0] + '@s.whatsapp.net'
    const botSettings = db.settings?.[botId] || {}
    const monedas = botSettings.currency || 'coins'

    // Verificar si economía está activada en el grupo
    if (chat.adminonly || !chat.economy) {
      return m.reply(`ꕥ Los comandos de *Economía* están desactivados en este grupo.\n\nUn *administrador* puede activarlos con el comando:\n» *${usedPrefix}economy on*`)
    }

    // =================== COMANDO #carrera ===================
    if (command === 'carrera') {
      // Verificar que no haya una carrera activa en este chat
      if (chat.carreraActiva) {
        return m.reply('ꕥ Ya hay una carrera en curso en este grupo. Espera a que termine.')
      }

      // Verificar que se mencionó a un usuario
      const mentioned = m.message?.extendedTextMessage?.contextInfo?.mentionedJid
      if (!mentioned || mentioned.length === 0) {
        return m.reply(`ꕥ Debes mencionar al usuario con quien quieres competir.\n> Ejemplo: *${usedPrefix}carrera @usuario 200*`)
      }
      const opponentId = mentioned[0]
      if (opponentId === userId) {
        return m.reply('ꕥ No puedes retarte a ti mismo. Menciona a otro usuario.')
      }

      // Verificar que exista el oponente en la base de datos (inicializar si no)
      chat.users[opponentId] ||= { coins: 0 }

      // Obtener apuesta
      const apuesta = parseInt(args[0])
      if (isNaN(apuesta) || apuesta < 100) {
        return m.reply(`ꕥ Apuesta inválida. Debe ser un número mayor o igual a 100 ${monedas}.`)
      }

      // Verificar fondos del retador
      if (user.coins < apuesta) {
        return m.reply(`ꕥ No tienes suficientes ${monedas}. Necesitas *${apuesta} ${monedas}*.`)
      }

      // Verificar que no haya un reto pendiente previo
      if (chat.retoPendiente) {
        // Si el reto anterior ya expiró, lo eliminamos
        if (chat.retoPendiente.expiracion < Date.now()) {
          // Devolver fondos al retador anterior
          const retadorAnterior = chat.retoPendiente.retador
          if (retadorAnterior && chat.users[retadorAnterior]) {
            chat.users[retadorAnterior].coins += chat.retoPendiente.apuestaRetador
          }
          delete chat.retoPendiente
        } else {
          return m.reply('ꕥ Ya hay un reto pendiente en este grupo. Espera a que sea aceptado o expire.')
        }
      }

      // Restar apuesta al retador (se guarda temporalmente)
      user.coins -= apuesta

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
          if (chat.users[userId]) {
            chat.users[userId].coins += apuesta
          }
          delete chat.retoPendiente
          client.sendMessage(chatId, { text: '⏳ El reto de carrera ha expirado por falta de respuesta.' })
        }
      }, 60000)
      // Guardar referencia del timeout para cancelarlo si se acepta
      chat.retoPendiente.timeout = timeout

      // Obtener nombres
      const retadorName = db.users?.[userId]?.name || userId.split('@')[0]
      const oponenteName = db.users?.[opponentId]?.name || opponentId.split('@')[0]

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

    // =================== COMANDO #aceptarcarrera ===================
    else if (command === 'aceptarcarrera') {
      // Verificar que hay un reto pendiente
      if (!chat.retoPendiente) {
        return m.reply('ꕥ No hay ningún reto de carrera pendiente en este grupo.')
      }

      const reto = chat.retoPendiente

      // Verificar que el usuario que acepta es el oponente
      if (userId !== reto.oponente) {
        const oponenteName = db.users?.[reto.oponente]?.name || reto.oponente.split('@')[0]
        return m.reply(`ꕥ Solo *${oponenteName}* puede aceptar este reto.`)
      }

      // Verificar que el reto no haya expirado
      if (reto.expiracion < Date.now()) {
        // Devolver fondos al retador
        if (chat.users[reto.retador]) {
          chat.users[reto.retador].coins += reto.apuestaRetador
        }
        delete chat.retoPendiente
        return m.reply('⏳ El reto de carrera ha expirado.')
      }

      // Verificar fondos del aceptante
      const aceptante = chat.users[userId] ||= { coins: 0 }
      if (aceptante.coins < reto.apuestaRetador) {
        return m.reply(`ꕥ No tienes suficientes ${monedas} para igualar la apuesta de *${reto.apuestaRetador} ${monedas}*.`)
      }

      // Restar apuesta del aceptante
      aceptante.coins -= reto.apuestaRetador

      // Cancelar el timeout de expiración
      clearTimeout(reto.timeout)

      // Eliminar el reto pendiente
      delete chat.retoPendiente

      // Iniciar la carrera
      await iniciarCarrera(client, chatId, userId, reto, monedas, db)
    }
  }
}

/**
 * Inicia la carrera entre retador y oponente
 */
async function iniciarCarrera(client, chatId, userIdAceptante, reto, monedas, db) {
  const chat = db.chats[chatId]
  const retadorId = reto.retador
  const oponenteId = reto.oponente
  const apuesta = reto.apuestaRetador
  const premioTotal = apuesta * 2

  // Obtener nombres
  const nombreRetador = db.users?.[retadorId]?.name || retadorId.split('@')[0]
  const nombreOponente = db.users?.[oponenteId]?.name || oponenteId.split('@')[0]

  // Configuración de la carrera
  const longitudMeta = 15 // número de posiciones hasta la meta
  let posRetador = 0
  let posOponente = 0
  let ganadorId = null
  let terminada = false

  // Crear el objeto de carrera activa
  const carrera = {
    jugadores: [
      { id: retadorId, nombre: nombreRetador, posicion: 0, apuesta },
      { id: oponenteId, nombre: nombreOponente, posicion: 0, apuesta }
    ],
    longitud: longitudMeta,
    mensajeId: null,
    intervalo: null,
    iniciada: Date.now()
  }
  chat.carreraActiva = carrera

  // Generar la vista inicial de la pista
  function generarPista(jugador) {
    const pos = jugador.posicion
    if (pos < longitudMeta) {
      return '─'.repeat(pos) + '🐎' + '─'.repeat(longitudMeta - pos - 1) + '🏁'
    } else {
      return '─'.repeat(longitudMeta) + '🐎'
    }
  }

  function construirMensajeCarrera() {
    const pistaRetador = generarPista(carrera.jugadores[0])
    const pistaOponente = generarPista(carrera.jugadores[1])
    return `╭┈ࠢ͜┅ࠦ͜͜╾݊͜─ׄ͜─֬͜─֟͜─֫͜─ׄ͜─݊͜┅ࠡ͜͜┈࠭͜
│        𐔌 CARRERA 𐦯
│
│ 🐎 ${carrera.jugadores[0].nombre}
│ ${pistaRetador}
│
│ 🐎 ${carrera.jugadores[1].nombre}
│ ${pistaOponente}
│
│ El primero en llegar gana *${premioTotal} ${monedas}*
╰┈ࠢ͜─ׄ͜─ׄ͜─ׄ͜─ׄ͜─ׄ͜─ׄ͜─ׄ͜─ׄ͜┈ࠢ͜╯`
  }

  // Función para mover a los jugadores
  function mover() {
    if (terminada) return

    // Mover cada jugador de 1 a 3 posiciones
    carrera.jugadores.forEach(j => {
      if (j.posicion < longitudMeta) {
        j.posicion += Math.floor(Math.random() * 3) + 1
      }
    })

    // Verificar si alguien llegó o superó la meta
    const jugadoresLlegados = carrera.jugadores.filter(j => j.posicion >= longitudMeta)
    if (jugadoresLlegados.length > 0) {
      terminada = true
      clearInterval(carrera.intervalo)

      // Determinar ganador
      if (jugadoresLlegados.length === 1) {
        ganadorId = jugadoresLlegados[0].id
      } else {
        // Dos llegaron en el mismo turno: gana el que tenga mayor posición (si igual, empate)
        if (jugadoresLlegados[0].posicion > jugadoresLlegados[1].posicion) {
          ganadorId = jugadoresLlegados[0].id
        } else if (jugadoresLlegados[1].posicion > jugadoresLlegados[0].posicion) {
          ganadorId = jugadoresLlegados[1].id
        } else {
          ganadorId = null // empate
        }
      }

      // Transferir monedas
      if (ganadorId) {
        // El ganador recibe el total de ambas apuestas
        chat.users[ganadorId].coins += premioTotal
        // Mostrar mensaje final con ganador
        const ganador = carrera.jugadores.find(j => j.id === ganadorId)
        const perdedor = carrera.jugadores.find(j => j.id !== ganadorId)
        // Actualizar pistas: el ganador sin meta, el perdedor con meta
        const pistaGanador = '─'.repeat(longitudMeta) + '🐎'
        const pistaPerdedor = perdedor.posicion < longitudMeta
          ? '─'.repeat(perdedor.posicion) + '🐎' + '─'.repeat(longitudMeta - perdedor.posicion - 1) + '🏁'
          : '─'.repeat(longitudMeta) + '🐎' // si también llegó pero no ganó (por menor posición), también se queda sin meta? según ejemplo el perdedor mantiene la meta aunque haya llegado? pero si llegó pero perdió por menor posición, realmente también llegó, pero según reglas, el ganador es el único que llega y se le quita la meta. En caso de que ambos lleguen y haya un ganador por mayor posición, el perdedor también llegó pero su pista debería mostrar la meta? El requisito dice: "Cuando un jugador llega o supera la meta: ese jugador gana; en su pista desaparece la meta 🏁; el perdedor mantiene la meta 🏁." Eso implica que si ambos llegan, el perdedor mantiene la meta, pero eso sería inconsistente porque él también llegó. Para simplificar, si ambos llegan, consideramos que el perdedor también llegó pero por regla mantiene la meta. Entonces para el perdedor, si su posición >= longitudMeta, mostramos la meta de todas formas? El ejemplo no cubre ese caso. Podemos hacer que si el perdedor también llegó, mostramos la meta igual para cumplir "mantiene la meta". Pero su posición podría ser mayor que la meta, entonces mostraríamos la meta al final después del caballo? Sería extraño. Mejor asumimos que solo uno puede ganar y el otro no ha llegado (en la práctica es raro que ambos lleguen exactamente igual, pero puede pasar si se mueven igual). Para mantener la lógica, si ambos llegan, el que no gana (por menor posición) realmente no ha llegado a la meta? Pero su posición es >= longitud, entonces según definición llegó. Sin embargo, para el propósito visual, podemos ajustar la posición del perdedor a un valor menor que la meta, restando 1 para que no muestre llegada. Eso sería manipular el estado. Mejor: si ambos llegan, se decide un ganador y al perdedor se le deja la meta (aunque su posición sea >= longitud, la pista se construye como si no hubiera llegado, usando su posición real pero mostrando la meta al final. Si posición >= longitud, normalmente no mostraríamos meta, pero para el perdedor sí queremos meta. Entonces en la construcción condicionamos: si el jugador es el ganador o (si no es ganador pero llegó) queremos meta? Según requisito, el perdedor mantiene la meta, así que aunque haya llegado, debe mostrar la meta. Entonces podemos modificar generarPista para que acepte un parámetro "mostrarMeta" o basado en si es el ganador. Pero es más sencillo: después de determinar ganador, ajustamos las posiciones de los perdedores para que sean menores que la meta (por ejemplo, longitudMeta - 1) para forzar que la meta aparezca. Pero eso falsea la carrera. Otra opción: en el mensaje final, construimos manualmente las pistas según las reglas, sin usar la función generarPista estándar. Hagamos eso.

        const mensajeFinal = `╭┈ࠢ͜┅ࠦ͜͜╾݊͜─ׄ͜─֬͜─֟͜─֫͜─ׄ͜─݊͜┅ࠡ͜͜┈࠭͜
│        𐔌 CARRERA FINALIZADA 𐦯
│
│ 🐎 ${ganador.nombre}
│ ${'─'.repeat(longitudMeta)}🐎
│
│ 🐎 ${perdedor.nombre}
│ ${perdedor.posicion < longitudMeta ? '─'.repeat(perdedor.posicion) + '🐎' + '─'.repeat(longitudMeta - perdedor.posicion - 1) + '🏁' : '─'.repeat(longitudMeta) + '🐎🏁'}
│
│ *Ganador:* @${ganadorId.split('@')[0]}
│ *Premio:* +${premioTotal} ${monedas}
╰┈ࠢ͜─ׄ͜─ׄ͜─ׄ͜─ׄ͜─ׄ͜─ׄ͜─ׄ͜─ׄ͜┈ࠢ͜╯`

        // Editar el mensaje con el resultado final
        await client.sendMessage(chatId, { text: mensajeFinal, edit: carrera.mensajeId, mentions: [ganadorId] })
      } else {
        // Empate: devolver apuestas
        chat.users[retadorId].coins += apuesta
        chat.users[oponenteId].coins += apuesta
        const mensajeEmpate = `╭┈ࠢ͜┅ࠦ͜͜╾݊͜─ׄ͜─֬͜─֟͜─֫͜─ׄ͜─݊͜┅ࠡ͜͜┈࠭͜
│        𐔌 CARRERA FINALIZADA 𐦯
│
│ 🐎 ${nombreRetador}
│ ${'─'.repeat(longitudMeta)}🐎
│
│ 🐎 ${nombreOponente}
│ ${'─'.repeat(longitudMeta)}🐎
│
│ *¡Empate!* Se devuelven las apuestas.
╰┈ࠢ͜─ׄ͜─ׄ͜─ׄ͜─ׄ͜─ׄ͜─ׄ͜─ׄ͜─ׄ͜┈ࠢ͜╯`
        await client.sendMessage(chatId, { text: mensajeEmpate, edit: carrera.mensajeId })
      }

      // Eliminar la carrera activa
      delete chat.carreraActiva
    } else {
      // Actualizar mensaje
      const nuevoTexto = construirMensajeCarrera()
      client.sendMessage(chatId, { text: nuevoTexto, edit: carrera.mensajeId })
    }
  }

  // Enviar mensaje inicial
  const msgInicial = await client.sendMessage(chatId, { text: construirMensajeCarrera() })
  carrera.mensajeId = msgInicial.key.id

  // Iniciar intervalo (cada 2 segundos)
  carrera.intervalo = setInterval(mover, 2000)
}
