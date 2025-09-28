# Elden Ring Save Manager

A cross-platform desktop application for managing Elden Ring save files, migrated from the original Java terminal application to a modern Electron GUI.

## Features

- **Cross-platform**: Works on Windows, macOS, and Linux
- **Modern GUI**: Beautiful and intuitive interface for save management
- **Save File Loading**: Load and parse Elden Ring .sl2 save files
- **Save Copying**: Copy saves between different save files
- **Save Extraction**: Extract individual saves as compressed .er files
- **Save Information**: View character name, level, and play time for each save slot
- **Compression**: Efficient Zstd compression for extracted saves (15x+ compression ratio)
- **Security**: Built with Electron's latest security practices

## Migration from Java Version

This Electron application provides the same functionality as the original Java terminal application but with a graphical user interface:

### Original Java Features → Electron Features
- **Terminal Menu System** → **Modern GUI with buttons and dialogs**
- **File Path Input** → **Native file selection dialogs**
- **Text-based Save Listing** → **Visual save cards with character info**
- **Command-line Operations** → **Point-and-click operations**
- **Manual File Management** → **Integrated save/load dialogs**

### Technical Migration
- **BND4 Format Parsing**: Ported from Java to JavaScript
- **Save Processing**: Maintains the same save slot management logic
- **Compression**: Uses Zstd compression (same as Java version)
- **Checksums**: Preserves MD5 checksum validation and updating
- **File Structure**: Maintains compatibility with .sl2 and .er file formats

## Getting Started

### Prerequisites

- Node.js (version 14 or higher)
- npm (comes with Node.js)

### Installation

1. Clone this repository:
   ```bash
   git clone <repository-url>
   cd Elden_Ring_Save_Manager
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

### Running the Application

#### Development Mode
```bash
npm run dev
```
This will start the application with DevTools open for debugging.

#### Production Mode
```bash
npm start
```

### Building the Application

#### Build for all platforms
```bash
npm run build
```

#### Build for specific platforms
```bash
npm run build-mac    # macOS
npm run build-win    # Windows
npm run build-linux  # Linux
```

Built applications will be available in the `dist` folder.

## How to Use

### 1. Load Save Files
- Click **"Load Source"** to select the save file you want to copy saves from
- Click **"Load Target"** to select the save file you want to copy saves to
- Both files must be Elden Ring .sl2 save files

### 2. View Save Information
- Once loaded, you'll see all save slots with:
  - Character name
  - Character level
  - Play time
  - Active status (which save slot is currently active)

### 3. Copy Saves
- Click **"Copy Save"** to open the copy dialog
- Select the source save slot you want to copy
- Select the target save slot where you want to paste it
- Click **"Copy"** to confirm
- Choose where to save the updated target file

### 4. Extract Saves
- Click **"Extract Save"** to save individual saves as .er files
- Select the save slot you want to extract
- Choose the location and filename for the extracted save
- The save will be compressed using Zstd for efficient storage

### 5. Keyboard Shortcuts
- **Ctrl/Cmd + O**: Load source file
- **Ctrl/Cmd + Shift + O**: Load target file
- **Ctrl/Cmd + C**: Open copy dialog
- **Ctrl/Cmd + E**: Open extract dialog
- **Escape**: Close dialogs

## File Formats

### .sl2 Files (Elden Ring Save Files)
- BND4 format container with multiple save slots
- Contains up to 10 save slots (0-9)
- Each slot has character data, save data, and checksums
- Approximately 26MB per file

### .er Files (Extracted Save Files)
- Custom format for individual save slots
- Zstd compressed (typically 15x+ compression ratio)
- Contains header data, checksum, and save data
- Approximately 170KB per extracted save

## Project Structure

```
Elden_Ring_Save_Manager/
├── main.js              # Main process (Electron's main thread)
├── renderer.js          # Renderer process (UI logic)
├── preload.js           # Preload script (secure IPC bridge)
├── save-manager.js      # Save file processing logic
├── index.html           # Application UI
├── styles.css           # Application styles
├── package.json         # Project configuration and dependencies
├── eldenring-save-manager-java/  # Original Java implementation
└── README.md            # This file
```

## Technical Details

### Save File Processing
- **BND4 Format**: Parses the binary format used by Elden Ring
- **Save Slots**: Extracts individual save data from the container
- **Checksums**: Validates and updates MD5 checksums for data integrity
- **Headers**: Processes save header information (character name, level, play time)

### Security
- Context isolation enabled
- Node integration disabled in renderer processes
- Content Security Policy enforced
- Secure IPC communication through preload script

### Compression
- Uses Zstd compression level 8 for optimal balance of speed and compression ratio
- Typical compression: 2.6MB → 170KB (15.4x compression)
- Maintains data integrity through checksums

## Troubleshooting

### Common Issues

1. **"Invalid save file format" Error**
   - Ensure you're selecting .sl2 files from Elden Ring
   - Check that the file isn't corrupted

2. **"Failed to load save file" Error**
   - Verify the file path is accessible
   - Make sure the file isn't being used by another application

3. **Compression/Decompression Errors**
   - Ensure zstd-codec dependency is properly installed
   - Try reinstalling node modules: `npm install`

### File Locations
Elden Ring save files are typically located at:
- **Windows**: `%APPDATA%\EldenRing\<steam_id>\`
- **Steam Deck/Linux**: `~/.local/share/Steam/steamapps/compatdata/1245620/pfx/drive_c/users/steamuser/AppData/Roaming/EldenRing/<steam_id>/`

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly with actual Elden Ring save files
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Original Java implementation by the Elden Ring save management community
- Electron framework for cross-platform desktop applications
- Zstd compression library for efficient save file storage