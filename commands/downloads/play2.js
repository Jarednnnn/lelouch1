import yts from 'yt-search'
import fetch from 'node-fetch'
import { getBuffer } from '../../lib/message.js'
import ytdl from 'ytdl-core'           // <-- AÑADIDO
import fs from 'fs'                     // <-- AÑADIDO
import path from 'path'                 // <-- AÑADIDO
import { fileURLToPath } from 'url'     // <-- AÑADIDO

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const tmpDir = path.join(__dirname, '../../tmp')

// Crear carpeta tmp si no existe
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })

const isYTUrl = (url) => /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/i.test(url)

export default {
  command: ['play2', 'mp4', 'ytmp4', 'ytvideo', 'playvideo'],
  category: 'downloader',
  run: async (client, m, args, usedPrefix, command) => {
    try {
      if (!args[0]) {
        return m.reply('《✧》Por favor, menciona el nombre o URL del video que deseas descargar')
      }
      const text = args.join(' ')
      const videoMatch = text.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/|v\/))([a-zA-Z0-9_-]{11})/)
      const query = videoMatch ? 'https://youtu.be/' + videoMatch[1] : text
      let url = query, title = null, thumbBuffer = null
      try {
        const search = await yts(query)
        if (search.all.length) {
          const videoInfo = videoMatch ? search.videos.find(v => v.videoId === videoMatch[1]) || search.all[0] : search.all[0]
          if (videoInfo) {
            url = videoInfo.url
            title = videoInfo.title
            thumbBuffer = await getBuffer(videoInfo.image)
            const vistas = (videoInfo.views || 0).toLocaleString()
            const canal = videoInfo.author?.name || 'Desconocido'
            const infoMessage = `➩ Descargando › *${title}*

> ❖ Canal › *${canal}*
> ⴵ Duración › *${videoInfo.timestamp || 'Desconocido'}*
> ❀ Vistas › *${vistas}*
> ✩ Publicado › *${videoInfo.ago || 'Desconocido'}*
> ❒ Enlace › *${url}*`
            await client.sendMessage(m.chat, { image: thumbBuffer, caption: infoMessage }, { quoted: m })
          }
        }
      } catch (err) {
        // Ignorar error de búsqueda
      }

      // Intentar con APIs externas
      let video = await getVideoFromApis(url)
      
      // Si las APIs fallan, usar ytdl-core como fallback
      if (!video?.url) {
        console.log('API falló, usando ytdl-core como fallback')
        video = await downloadWithYtdl(url)
        if (!video?.url) {
          return m.reply('《✧》 No se pudo descargar el *video*, intenta más tarde.')
        }
      }

      const videoBuffer = await getBuffer(video.url)
      await client.sendMessage(m.chat, { video: videoBuffer, fileName: `${title || 'video'}.mp4`, mimetype: 'video/mp4' }, { quoted: m })
    } catch (e) {
      await m.reply(`> An unexpected error occurred while executing command *${usedPrefix + command}*. Please try again or contact support if the issue persists.\n> [Error: *${e.message}*]`)
    }
  }
}

async function getVideoFromApis(url) {
  const apis = [
    { api: 'Adonix', endpoint: `${global.APIs.adonix.url}/download/ytvideo?apikey=${global.APIs.adonix.key}&url=${encodeURIComponent(url)}`, extractor: res => res?.data?.url },    
    { api: 'Vreden', endpoint: `${global.APIs.vreden.url}/api/v1/download/youtube/video?url=${encodeURIComponent(url)}&quality=360`, extractor: res => res.result?.download?.url },
    { api: 'Stellar', endpoint: `${global.APIs.stellar.url}/dl/ytdl?url=${encodeURIComponent(url)}&format=mp4&key=${global.APIs.stellar.key}`, extractor: res => res.result?.download },
    { api: 'Nekolabs', endpoint: `${global.APIs.nekolabs.url}/downloader/youtube/v1?url=${encodeURIComponent(url)}&format=360`, extractor: res => res.result?.downloadUrl },
    { api: 'Vreden v2', endpoint: `${global.APIs.vreden.url}/api/v1/download/play/video?query=${encodeURIComponent(url)}`, extractor: res => res.result?.download?.url }
  ]

  for (const { api, endpoint, extractor } of apis) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)
      const res = await fetch(endpoint, { signal: controller.signal }).then(r => r.json())
      clearTimeout(timeout)
      const link = extractor(res)
      if (link) return { url: link, api }
    } catch (e) {}
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  return null
}

// ==================== NUEVA FUNCIÓN FALLBACK ====================
async function downloadWithYtdl(url) {
  try {
    // Validar que sea una URL de YouTube válida
    if (!ytdl.validateURL(url)) {
      console.log('URL no válida para ytdl-core')
      return null
    }

    // Obtener información del video (opcional, para el nombre)
    const info = await ytdl.getInfo(url)
    const title = info.videoDetails.title.replace(/[^\w\s]/gi, '') // limpiar nombre

    // Elegir formato de video con calidad baja para evitar archivos muy grandes
    const format = ytdl.chooseFormat(info.formats, { 
      quality: 'lowest',
      filter: 'videoandaudio' 
    })

    if (!format) {
      console.log('No se encontró formato de video')
      return null
    }

    // Descargar el video a un archivo temporal
    const fileName = `yt_fallback_${Date.now()}.mp4`
    const filePath = path.join(tmpDir, fileName)
    
    const stream = ytdl(url, { format })
    const writeStream = fs.createWriteStream(filePath)
    
    await new Promise((resolve, reject) => {
      stream.pipe(writeStream)
      writeStream.on('finish', resolve)
      writeStream.on('error', reject)
    })

    // Verificar tamaño (máximo 100MB para WhatsApp)
    const stats = fs.statSync(filePath)
    const fileSizeMB = stats.size / (1024 * 1024)
    if (fileSizeMB > 100) {
      fs.unlinkSync(filePath)
      console.log('Video demasiado grande (>100MB)')
      return null
    }

    // Leer el archivo y luego eliminarlo
    const buffer = fs.readFileSync(filePath)
    fs.unlinkSync(filePath) // eliminar archivo temporal

    return { url: buffer, api: 'ytdl-core (fallback)' }
  } catch (err) {
    console.error('Error en ytdl-core:', err)
    return null
  }
}
