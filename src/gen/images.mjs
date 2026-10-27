import process from 'node:process'

// `officina gen` legge `images` da officina.config.ts e la passa qui, come `OFFICINA_GENERATORS`.
export const imageSource = () => (process.env.OFFICINA_IMAGES === 'cloudinary' ? 'cloudinary' : 'local')

export function imageData(answers) {
  const image = answers.image === true
  const cloudinary = imageSource() === 'cloudinary'
  return { localImage: image && !cloudinary, cloudinaryImage: image && cloudinary }
}
