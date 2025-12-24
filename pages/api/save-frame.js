import fs from 'fs';
import path from 'path';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb', // Adjust if needed for 4K images
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { sequenceName, frameIndex, image } = req.body;

    if (!sequenceName || frameIndex === undefined || !image) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Remove header from base64 string
    const base64Data = image.replace(/^data:image\/png;base64,/, "");
    
    // Define path: public/recordings/[sequenceName]
    const recordingsDir = path.join(process.cwd(), 'public', 'recordings');
    const sequenceDir = path.join(recordingsDir, sequenceName);

    // Ensure directories exist
    if (!fs.existsSync(recordingsDir)) {
      fs.mkdirSync(recordingsDir);
    }
    if (!fs.existsSync(sequenceDir)) {
      fs.mkdirSync(sequenceDir);
    }

    // Write file
    const fileName = `frame_${String(frameIndex).padStart(4, '0')}.png`;
    const filePath = path.join(sequenceDir, fileName);

    fs.writeFileSync(filePath, base64Data, 'base64');

    res.status(200).json({ success: true, path: filePath });
  } catch (error) {
    console.error('Error saving frame:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
}
