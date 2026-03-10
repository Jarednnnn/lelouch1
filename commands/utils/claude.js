import axios from 'axios'

export default {
  command: ['claude'],
  category: 'utils',
  run: async (client, m, args, command, text, prefix) => {
    if (!text) {
        return m.reply(`✎ Escriba una *petición* para que *Claude* le responda.`)
    }

    try {
      const apiUrl = `${api.url}/ai/claude?text=${encodeURIComponent(text)}&key=${api.key}`

      const { key } = await client.sendMessage(
        m.chat,
        { text: `✎ *Claude* está procesando tu respuesta...` },
        { quoted: m },
      )

      const res = await axios.get(apiUrl)

      if (!res.data?.status || !res.data?.answer) {
        throw new Error('Respuesta inválida del servidor: ' + JSON.stringify(res.data))
      }

      const replyText = res.data.answer
      await client.sendMessage(m.chat, { text: replyText, edit: key })

    } catch (e) {
      // Aquí reemplazamos msgglobal por un mensaje construido al momento
      await m.reply(`《✧》 Error al ejecutar el comando *${prefix + command}*. Por favor intenta nuevamente.\n[Error: ${e.message}]`)
    }
  }
}
