const express = require('express');
const multer = require('multer');
const mammoth = require('mammoth');
const fs = require('fs');
const { OpenAI } = require('openai'); // Use the OpenAI client library for Node.js
require("dotenv").config();
// Initialize OpenAI client
const openaiClient = new OpenAI({
  apiKey: process.env.Openaikey, // Replace with your OpenAI API key
});

const app = express();
const port = 3000;

// Set up multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Convert DOCS to Audio endpoint
app.post('/docstoaudio', upload.single('docs'), async (req, res) => {
  const filePath = req.file.path;

  try {
    // Step 1: Extract text from the DOCS file
    const { value: extractedText } = await mammoth.extractRawText({ path: filePath });
    
    if (!extractedText) {
      throw new Error('No text found in the DOCS file.');
    }

    // Step 2: Translate the extracted text
    const targetLanguage = req.body.language || 'en'; // Default to English if no language is specified
    const translatedText = await translatetext(extractedText, targetLanguage);

    if (!translatedText) {
      throw new Error('Translation failed.');
    }

    // Step 3: Convert the translated text to audio
    const tone = req.body.tone || 'nova'; // Use the specified tone or a default value
    const audioFilePath = await textToSpeech(translatedText, tone);

    // Step 4: Set headers to play audio in the browser
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', 'inline');

    // Step 5: Stream the audio to the response
    const audioStream = fs.createReadStream(audioFilePath);
    audioStream.pipe(res);

    // Clean up files after streaming is done
    audioStream.on('end', () => {
      fs.unlinkSync(filePath); // Delete the uploaded DOCS file
      fs.unlinkSync(audioFilePath); // Delete the generated audio file
    });

    // Handle errors during streaming
    audioStream.on('error', (streamErr) => {
      console.error('Error streaming audio:', streamErr);
      res.status(500).send({ error: 'Error streaming audio.' });
    });

  } catch (error) {
    // Handle errors during the DOCS to audio conversion
    res.status(500).send({ error: `Error converting DOCS to audio: ${error.message}` });

    // Clean up files if an error occurs
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
});

// Step 3: Translate text using OpenAI GPT-4 model
async function translatetext(text, targetLanguage) {
  try {
    const response = await openaiClient.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that translates text."
        },
        {
          role: "user",
          content: `Translate the following text to ${targetLanguage}:\n\n${text}`
        }
      ],
      max_tokens: 1000,
    });
    return response.choices[0].message.content.trim();
  } catch (error) {
    throw new Error(`Translation failed: ${error.message}`);
  }
}

// Step 4: Convert text to audio using OpenAI TTS-1 model
async function textToSpeech(text, tone) {
  try {
    const mp3 = await openaiClient.audio.speech.create({
      model: 'tts-1',
      voice: tone,
      input: text,
    });
    const arrayBuffer = await mp3.arrayBuffer();
    const filePath = `uploads/${Date.now()}_output.mp3`;
    fs.writeFileSync(filePath, Buffer.from(arrayBuffer));
    return filePath;
  } catch (error) {
    throw new Error(`Text to speech conversion failed: ${error.message}`);
  }
}

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
