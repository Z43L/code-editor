
      /*#######.
     ########",#:
   #########',##".
  ##'##'## .##',##.
   ## ## ## # ##",#.
    ## ## ## ## ##'
     ## ## ## :##
      ## ## ##*/

import { languageDemiliters } from './delimiters'

export type HeaderInfo = {
  filename: string,
  author: string,
  createdBy: string,
  createdAt: Date,
  updatedBy: string,
  updatedAt: Date
}

export type HeaderConfig = {
  username: string,
  email: string,
  asciiLogo?: string,
  domain?: string
}

/**
 * Default 42 ASCII logo lines (right side of header)
 * Extracted from official 42 header format - EXACTLY as standard
 */
const default42Logo = [
  ':::      ::::::::   ',  // Line 1
  ':+:      :+:    :+:   ',  // Line 2
  '  +:+ +:+         +:+     ',  // Line 3
  '+#+  +:+       +#+        ',  // Line 4
  '+#+#+#+#+#+   +#+           ',  // Line 5
  '#+#    #+#             ',  // Line 6
  '###   ########.fr       '   // Line 7
]

/**
 * Validate that all lines in template are exactly 80 characters
 */
const validateTemplate = (template: string): boolean => {
  const lines = template.split('\n')
  const headerLines = lines.slice(0, 11) // Only the 11 header lines

  let isValid = true
  headerLines.forEach((line, index) => {
    if (line.length !== 80) {
      console.error(`Line ${index + 1} has ${line.length} chars, expected 80`)
      console.error(`Content: "${line}"`)
      isValid = false
    }
  })

  return isValid
}

/**
 * Generate template with logo ensuring EXACTLY 80 characters per line
 */
const generateTemplate = (logoLines: string[] = default42Logo, isDefaultLogo: boolean = true): string => {
  // Prepare logo: ensure exactly 7 lines
  const lines = [...logoLines]
  while (lines.length < 7) lines.push('')

  // Para el logo por defecto, NO truncar. Para logos custom, sí truncar a 24 chars
  const logo = lines.slice(0, 7).map(line => {
    if (isDefaultLogo) {
      // Logo por defecto: mantener tal cual (puede tener longitud variable)
      return line
    } else {
      // Logo custom: asegurar exactamente 24 caracteres
      if (line.length > 24) {
        console.warn(`Logo line truncated from ${line.length} to 24 chars`)
        return line.substring(0, 24)
      }
      return line.padEnd(24, ' ')
    }
  })

  // Build placeholders with exact widths
  const FILENAME = '$FILENAME' + '_'.repeat(33)  // Total: 42 chars
  const AUTHOR = '$AUTHOR' + '_'.repeat(28)      // Total: 35 chars
  const CREATEDAT = '$CREATEDAT' + '_'.repeat(9) // Total: 19 chars
  const CREATEDBY = '$CREATEDBY' + '_'.repeat(0) // Total: 10 chars
  const UPDATEDAT = '$UPDATEDAT' + '_'.repeat(9) // Total: 19 chars
  const UPDATEDBY = '$UPDATEDBY' + '_'.repeat(0) // Total: 10 chars

  // IMPORTANTE: Cada línea debe tener 74 caracteres (sin contar /* y */)
  // Calcular espaciado dinámicamente basado en la longitud del logo

  const border = '*'.repeat(74)
  const empty = ' '.repeat(74)

  // Línea 3: solo logo (espacios + logo = 74)
  const line3 = ' '.repeat(74 - logo[0].length) + logo[0]

  // Línea 4: 3 espacios + filename (42) + espacios dinámicos + logo
  const line4Spaces = 74 - 3 - FILENAME.length - logo[1].length
  const line4 = '   ' + FILENAME + ' '.repeat(line4Spaces) + logo[1]

  // Línea 5: solo logo
  const line5 = ' '.repeat(74 - logo[2].length) + logo[2]

  // Línea 6: 3 + "By: " (4) + author (35) + espacios dinámicos + logo
  const line6Spaces = 74 - 3 - 4 - AUTHOR.length - logo[3].length
  const line6 = '   By: ' + AUTHOR + ' '.repeat(line6Spaces) + logo[3]

  // Línea 7: solo logo
  const line7 = ' '.repeat(74 - logo[4].length) + logo[4]

  // Línea 8: 3 + "Created: " (9) + date (19) + " by " (4) + user (10) + espacios + logo
  const line8Spaces = 74 - 3 - 9 - CREATEDAT.length - 4 - CREATEDBY.length - logo[5].length
  const line8 = '   Created: ' + CREATEDAT + ' by ' + CREATEDBY + ' '.repeat(line8Spaces) + logo[5]

  // Línea 9: 3 + "Updated: " (9) + date (19) + " by " (4) + user (10) + espacios + logo
  const line9Spaces = 74 - 3 - 9 - UPDATEDAT.length - 4 - UPDATEDBY.length - logo[6].length
  const line9 = '   Updated: ' + UPDATEDAT + ' by ' + UPDATEDBY + ' '.repeat(line9Spaces) + logo[6]

  // Assemble template (each line will be 80 chars)
  const content = [
    border,  // Line 1
    empty,   // Line 2
    line3,   // Line 3
    line4,   // Line 4
    line5,   // Line 5
    line6,   // Line 6
    line7,   // Line 7
    line8,   // Line 8
    line9,   // Line 9
    empty,   // Line 10
    border   // Line 11
  ]

  // Add delimiters and join
  const template = content.map(line => `/* ${line} */`).join('\n') + '\n\n'

  return template
}

/**
 * Template where each field name is prefixed by $ and is padded with _
 * Each line must be EXACTLY 80 characters (including comment delimiters)
 */
const genericTemplate = generateTemplate()

/**
 * Get specific header template for languageId
 */
const getTemplate = (languageId: string, config?: HeaderConfig) => {
  const [left, right] = languageDemiliters[languageId] || ['/* ', ' */']
  const width = left.length

  // Generate template with custom logo if provided
  let template = genericTemplate
  if (config?.asciiLogo && config.asciiLogo.trim()) {
    let customLines = config.asciiLogo.split('\n')

    // Ensure exactly 7 lines
    while (customLines.length < 7) customLines.push('')
    customLines = customLines.slice(0, 7)

    // Generar template con logo custom (isDefaultLogo = false)
    template = generateTemplate(customLines, false)
  }

  // Replace all delimiters with ones for current language
  return template
    .replace(new RegExp(`^(.{${width}})(.*)(.{${width}})$`, 'gm'),
    left + '$2' + right)
}

/**
 * Fit value to correct field width, padded with spaces
 */
const pad = (value: string, width: number): string => {
  if (value.length > width) {
    return value.substring(0, width) // Truncate if too long
  }
  return value.padEnd(width, ' ') // Pad with spaces if short
}

/**
 * Stringify Date to correct format for header
 */
const formatDate = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')

  return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`
}

/**
 * Get Date object from date string formatted for header
 */
const parseDate = (date: string): Date => {
  // Format: YYYY/MM/DD HH:mm:ss
  const [datePart, timePart] = date.split(' ')
  const [year, month, day] = datePart.split('/').map(Number)
  const [hours, minutes, seconds] = timePart.split(':').map(Number)

  return new Date(year, month - 1, day, hours, minutes, seconds)
}

/**
 * Check if language is supported
 */
export const supportsLanguage = (languageId: string) =>
  languageId in languageDemiliters

/**
 * Returns current header text if present at top of document
 */
export const extractHeader = (text: string): string | null => {
  const headerRegex = `^(.{80}(\r\n|\n)){10}`
  const match = text.match(headerRegex)

  return match ? match[0].split('\r\n').join('\n') : null
}

/**
 * Regex to match field in template
 * Returns [ global match, offset, field ]
 */
const fieldRegex = (name: string) =>
  new RegExp(`^((?:.*\\\n)*.*)(\\\$${name}_*)`, '')

/**
 * Get value for given field name from header string
 */
const getFieldValue = (header: string, name: string) => {
  const [_, offset, field] = genericTemplate.match(fieldRegex(name))

  return header.substr(offset.length, field.length)
}

/**
 * Set field value in header string
 */
const setFieldValue = (header: string, name: string, value: string) => {
  const [_, offset, field] = genericTemplate.match(fieldRegex(name))

  return header.substr(0, offset.length)
    .concat(pad(value, field.length))
    .concat(header.substr(offset.length + field.length))
}

/**
 * Extract header info from header string
 */
export const getHeaderInfo = (header: string): HeaderInfo => ({
  filename: getFieldValue(header, 'FILENAME'),
  author: getFieldValue(header, 'AUTHOR'),
  createdBy: getFieldValue(header, 'CREATEDBY'),
  createdAt: parseDate(getFieldValue(header, 'CREATEDAT')),
  updatedBy: getFieldValue(header, 'UPDATEDBY'),
  updatedAt: parseDate(getFieldValue(header, 'UPDATEDAT'))
})

/**
 * Renders a language template with header info
 */
export const renderHeader = (languageId: string, info: HeaderInfo, config?: HeaderConfig) => [
  { name: 'FILENAME', value: info.filename },
  { name: 'AUTHOR', value: info.author },
  { name: 'CREATEDAT', value: formatDate(info.createdAt) },
  { name: 'CREATEDBY', value: info.createdBy },
  { name: 'UPDATEDAT', value: formatDate(info.updatedAt) },
  { name: 'UPDATEDBY', value: info.updatedBy }
].reduce((header, field) =>
  setFieldValue(header, field.name, field.value),
  getTemplate(languageId, config))

/**
 * Create a new header with current user info
 */
export const createHeader = (
  filename: string,
  languageId: string,
  config: HeaderConfig
): string => {
  const now = new Date()
  const info: HeaderInfo = {
    filename,
    author: `${config.username} <${config.email}>`,
    createdBy: config.username,
    createdAt: now,
    updatedBy: config.username,
    updatedAt: now
  }

  return renderHeader(languageId, info, config)
}

/**
 * Update the updatedAt and updatedBy fields in an existing header
 */
export const updateHeader = (
  existingHeader: string,
  username: string
): string => {
  const now = new Date()
  let updated = setFieldValue(existingHeader, 'UPDATEDAT', formatDate(now))
  updated = setFieldValue(updated, 'UPDATEDBY', username)
  return updated
}
