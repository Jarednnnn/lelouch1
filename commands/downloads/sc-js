import fetch from 'node-fetch';
import { getBuffer } from '../../lib/message.js';

export default {
  command: ['sc', 'soundcloud', 'scaudio'],
  category: 'downloader',
  run: async (client, m, args) => {
    try {
      if (!args[0]) {
        return m.reply('✎ Por favor, menciona el nombre del track de SoundCloud que deseas descargar')
      }

      const query = args.join(' ')
      let result

      try {
        const res = await fetch(`${api.url}/dl/soundcloudsearch?query=${encodeURIComponent(query)}&key=${api.key}`)
        result = await res.json()
        if (!result.success || !result.data || !result.data.dl) {
          return m.reply('✎ No se encontraron resultados en SoundCloud')
        }
      } catch {
        return m.reply('ꕥ No se pudo procesar el enlace. El servidor no respondió correctamente.')
      }

      const track = result.data
      const audioTitle = track.title
      const dlUrl = track.dl
      const thumbUrl = track.banner
      const artist = track.artist
      const duration = (track.duration / 1000).toFixed(0) + 's'

      const caption = `➥ Descargando › ${audioTitle}

> ✿⃘࣪◌ ֪ Artista › ${artist}
> ✿⃘࣪◌ ֪ Duración › ${duration}

𐙚 ❀ ｡ ↻ El archivo se está enviando, espera un momento... ˙𐙚`

          await client.sendMessage(m.chat, { image: { url: thumbUrl }, caption }, { quoted: m })

      const audioBuffer = await getBuffer(dlUrl)
      let mensaje;

        mensaje = {
          audio: audioBuffer,
          mimetype: 'audio/mpeg',
          fileName: `${audioTitle}.mp3`
        };

      await client.sendMessage(m.chat, mensaje, { quoted: m })

    } catch (e) {
     // console.log(e)
      await m.reply(msgglobal)
    }
  }
};
