import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

// Constants
const STORAGE_KEY = 'shopping-cart';
const DB_NAME = 'HybridCartDB';
const STORE_NAME = 'cart';

// Initialize IndexedDB
const initDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
};

// Cart Context
const CartContext = createContext();

const CartProvider = ({ children }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const dbRef = useRef(null);
  const syncTimeoutRef = useRef(null);

  // Load initial data from localStorage (fast initial render)
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setItems(JSON.parse(stored));
      } catch (error) {
        console.error('Failed to parse localStorage data:', error);
      }
    }
  }, []);

  // Initialize IndexedDB and load data
  useEffect(() => {
    const init = async () => {
      try {
        const db = await initDB();
        dbRef.current = db;
        
        // Load data from IndexedDB
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        
        request.onsuccess = () => {
          if (request.result.length > 0) {
            setItems(request.result);
            // Update localStorage with IndexedDB data
            localStorage.setItem(STORAGE_KEY, JSON.stringify(request.result));
          }
          setLoading(false);
        };
      } catch (error) {
        console.error('Failed to initialize DB:', error);
        setLoading(false);
      }
    };

    init();
    
    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, []);

  // Handle cross-tab communication
  useEffect(() => {
    const channel = new BroadcastChannel('hybrid-cart');
    
    const handleMessage = (event) => {
      if (event.data.type === 'CART_UPDATED') {
        // Only update if the data is different
        if (JSON.stringify(items) !== JSON.stringify(event.data.items)) {
          setItems(event.data.items);
        }
      }
    };
    
    channel.addEventListener('message', handleMessage);
    return () => {
      channel.removeEventListener('message', handleMessage);
      channel.close();
    };
  }, [items]);

  // Sync with other tabs
  const notifyOtherTabs = useCallback((newItems) => {
    const channel = new BroadcastChannel('hybrid-cart');
    channel.postMessage({ type: 'CART_UPDATED', items: newItems });
    channel.close();
  }, []);

  // Debounced sync to IndexedDB
  const syncToIndexedDB = useCallback((newItems) => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }

    syncTimeoutRef.current = setTimeout(async () => {
      if (!dbRef.current) return;

      try {
        const transaction = dbRef.current.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        
        // Clear existing items
        await new Promise((resolve, reject) => {
          const clearRequest = store.clear();
          clearRequest.onsuccess = () => resolve();
          clearRequest.onerror = () => reject(clearRequest.error);
        });

        // Add all items
        for (const item of newItems) {
          await new Promise((resolve, reject) => {
            const request = store.add(item);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
          });
        }
      } catch (error) {
        console.error('Failed to sync with IndexedDB:', error);
      }
    }, 1000); // Debounce for 1 second
  }, []);

  // Update all storage methods
  const updateStorage = useCallback((newItems) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newItems));
    syncToIndexedDB(newItems);
    notifyOtherTabs(newItems);
  }, [syncToIndexedDB, notifyOtherTabs]);

  const addItem = useCallback((product) => {
    setItems(prev => {
      const existingItem = prev.find(item => item.id === product.id);
      const newItems = existingItem
        ? prev.map(item =>
            item.id === product.id
              ? { ...item, quantity: item.quantity + 1 }
              : item
          )
        : [...prev, { ...product, quantity: 1 }];
      
      updateStorage(newItems);
      return newItems;
    });
  }, [updateStorage]);

  const updateQuantity = useCallback((productId, quantity) => {
    if (quantity < 1) return;
    
    setItems(prev => {
      const newItems = prev.map(item =>
        item.id === productId ? { ...item, quantity } : item
      );
      updateStorage(newItems);
      return newItems;
    });
  }, [updateStorage]);

  const removeItem = useCallback((productId) => {
    setItems(prev => {
      const newItems = prev.filter(item => item.id !== productId);
      updateStorage(newItems);
      return newItems;
    });
  }, [updateStorage]);

  const clearCart = useCallback(() => {
    setItems([]);
    localStorage.removeItem(STORAGE_KEY);
    if (dbRef.current) {
      const transaction = dbRef.current.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.clear();
    }
    notifyOtherTabs([]);
  }, [notifyOtherTabs]);

  return (
    <CartContext.Provider value={{ 
      items, 
      loading,
      addItem, 
      updateQuantity, 
      removeItem,
      clearCart,
      total: items.reduce((sum, item) => sum + (item.price * item.quantity), 0)
    }}>
      {children}
    </CartContext.Provider>
  );
};

// Sample products data
const SAMPLE_PRODUCTS = [
  { id: 1, name: 'Laptop', price: 999 },
  { id: 2, name: 'Smartphone', price: 699 },
  { id: 3, name: 'Headphones', price: 199 },
];

// Product List Component
const ProductList = () => {
  const { addItem } = useContext(CartContext);

  return (
    <div className="border p-4 rounded-lg">
      <h2 className="text-xl font-bold mb-4">Products</h2>
      <div className="space-y-4">
        {SAMPLE_PRODUCTS.map(product => (
          <div key={product.id} className="flex justify-between items-center p-2 border rounded">
            <div>
              <h3 className="font-semibold">{product.name}</h3>
              <p className="text-gray-600">${product.price}</p>
            </div>
            <button
              onClick={() => addItem(product)}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors"
            >
              Add to Cart
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

// Shopping Cart Component
const ShoppingCart = () => {
  const { items, loading, updateQuantity, removeItem, clearCart, total } = useContext(CartContext);
  
  if (loading) {
    return (
      <div className="border p-4 rounded-lg">
        <h2 className="text-xl font-bold mb-4">Shopping Cart</h2>
        <div className="animate-pulse space-y-4">
          <div className="h-10 bg-gray-200 rounded"></div>
          <div className="h-10 bg-gray-200 rounded"></div>
          <div className="h-10 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="border p-4 rounded-lg">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Shopping Cart</h2>
        {items.length > 0 && (
          <button
            onClick={clearCart}
            className="text-red-500 hover:text-red-600 transition-colors"
          >
            Clear Cart
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-gray-500">Your cart is empty</p>
      ) : (
        <div className="space-y-4">
          {items.map(item => (
            <div key={item.id} className="flex justify-between items-center p-2 border rounded">
              <div>
                <h3 className="font-semibold">{item.name}</h3>
                <p className="text-gray-600">${item.price}</p>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="number"
                  min="1"
                  value={item.quantity}
                  onChange={e => updateQuantity(item.id, parseInt(e.target.value))}
                  className="w-16 p-1 border rounded"
                />
                <button
                  onClick={() => removeItem(item.id)}
                  className="text-red-500 hover:text-red-600 transition-colors"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
          <div className="pt-4 border-t">
            <p className="text-xl font-bold">Total: ${total.toFixed(2)}</p>
          </div>
        </div>
      )}
    </div>
  );
};

// Main App Component
const App = () => {
  return (
    <CartProvider>
      <div className="p-4 max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Shopping Cart Demo (Hybrid Storage)</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ProductList />
          <ShoppingCart />
        </div>
      </div>
    </CartProvider>
  );
};

export default App;