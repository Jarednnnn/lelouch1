const groupMetadataCache = new Map()
const lidCache = new Map()
const metadataTTL = 5000 // 5 segundos de frescura máxima
function getCachedMetadata(groupChatId) {
  const cached = groupMetadataCache.get(groupChatId)
  if (!cached || Date.now() - cached.timestamp > metadataTTL) return null
  return cached.metadata
}
function normalizeToJid(phone) {
  if (!phone) return null
  const base = typeof phone === 'number' ? phone.toString() : phone.replace(/\D/g, '')
  return base ? `${base}@s.whatsapp.net` : null
}
export async function resolveLidToRealJid(lid, client, groupChatId) {
  const input = lid?.toString().trim()
  if (!input || !groupChatId?.endsWith('@g.us')) return input
  if (input.endsWith('@s.whatsapp.net')) return input
  if (lidCache.has(input)) return lidCache.get(input)
  const lidBase = input.split('@')[0]
  // Intento 1: buscar en el store de contactos de Baileys (mapeo LID ↔ teléfono)
  const contacts = client.store?.contacts || client.contacts || {}
  for (const [jid, contact] of Object.entries(contacts)) {
    if (!jid.endsWith('@s.whatsapp.net')) continue
    const contactLid = (contact?.lid || contact?.id || '').split('@')[0]
    if (contactLid && contactLid === lidBase) {
      return lidCache.set(input, jid), jid
    }
  }
  // Intento 2: buscar en metadata del grupo por p.phoneNumber o p.id
  let metadata = getCachedMetadata(groupChatId)
  if (!metadata) {
    try {
      metadata = await client.groupMetadata(groupChatId)
      groupMetadataCache.set(groupChatId, { metadata, timestamp: Date.now() })
    } catch {
      return lidCache.set(input, input), input
    }
  }
  for (const p of metadata.participants || []) {
    const idBase = p?.id?.split('@')[0]?.trim()
    // Si el participante tiene @s.whatsapp.net directo (grupo sin LID completo)
    if (p?.id?.endsWith('@s.whatsapp.net') && idBase === lidBase) {
      return lidCache.set(input, p.id), p.id
    }
    // Intento con phoneNumber si existe
    const phoneRaw = p?.phoneNumber
    const phone = normalizeToJid(phoneRaw)
    if (!idBase || !phone) continue
    if (idBase === lidBase) return lidCache.set(input, phone), phone
  }
  return lidCache.set(input, input), input
}
// Permite poblar el cache manualmente cuando se recibe un mensaje
// (llamar desde main.js al conocer la relación lid ↔ jid)
export function registerLidMapping(lid, jid) {
  if (lid && jid && lid !== jid) {
    lidCache.set(lid, jid)
  }
}
