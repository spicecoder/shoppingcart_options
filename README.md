# Shopping Cart Options Demo

A demonstration of different shopping cart implementations using various storage approaches in React displaying architectural forces of concern.

## Shopping Cart Options

Four different implementations showcasing different storage approaches:

- **Context:** Simple in-memory state management
- **LocalStorage:** Persistent storage with browser's localStorage API
- **IndexedDB:** Advanced storage using browser's IndexedDB
- **Hybrid:** Combined approach using multiple storage methods

## Getting Started

To run each demo version:

1. Navigate to the specific implementation:
   ```bash
   cd shopping-cart-[version]
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

Replace `[version]` with one of: `context`, `localstorage`, `indexeddb`, or `hybrid`
