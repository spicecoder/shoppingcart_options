import React, { createContext, useContext, useState, useEffect } from 'react';

// IndexedDB setup
const initDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('ShoppingCartDB', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('cart')) {
        db.createObjectStore('cart', { keyPath: 'id' });
      }
    };
  });
};

// Cart Context
const CartContext = createContext();

const CartProvider = ({ children }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [db, setDb] = useState(null);

  // Initialize IndexedDB
  useEffect(() => {
    initDB()
      .then(database => {
        setDb(database);
        // Load initial data
        const transaction = database.transaction('cart', 'readonly');
        const store = transaction.objectStore('cart');
        const request = store.getAll();
        
        request.onsuccess = () => {
          setItems(request.result);
          setLoading(false);
        };
      })
      .catch(error => {
        console.error('Failed to initialize DB:', error);
        setLoading(false);
      });
  }, []);

  // Handle cross-tab communication
  useEffect(() => {
    const channel = new BroadcastChannel('shopping-cart');
    
    const handleMessage = (event) => {
      if (event.data.type === 'CART_UPDATED' && db) {
        const transaction = db.transaction('cart', 'readonly');
        const store = transaction.objectStore('cart');
        const request = store.getAll();
        
        request.onsuccess = () => {
          setItems(request.result);
        };
      }
    };
    
    channel.addEventListener('message', handleMessage);
    return () => {
      channel.removeEventListener('message', handleMessage);
      channel.close();
    };
  }, [db]);

  const notifyOtherTabs = () => {
    const channel = new BroadcastChannel('shopping-cart');
    channel.postMessage({ type: 'CART_UPDATED' });
    channel.close();
  };

  const addItem = async (product) => {
    if (!db) return;

    const existingItem = items.find(item => item.id === product.id);
    const newItem = existingItem
      ? { ...existingItem, quantity: existingItem.quantity + 1 }
      : { ...product, quantity: 1 };
    
    // Optimistic update
    setItems(prev => {
      if (existingItem) {
        return prev.map(item =>
          item.id === product.id ? newItem : item
        );
      }
      return [...prev, newItem];
    });
    
    try {
      const transaction = db.transaction('cart', 'readwrite');
      const store = transaction.objectStore('cart');
      await new Promise((resolve, reject) => {
        const request = store.put(newItem);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
      notifyOtherTabs();
    } catch (error) {
      console.error('Failed to add item:', error);
      setItems(prev => existingItem ? prev : prev.filter(item => item.id !== product.id));
    }
  };

  const updateQuantity = async (productId, quantity) => {
    if (!db || quantity < 1) return;

    const item = items.find(item => item.id === productId);
    if (!item) return;

    const updatedItem = { ...item, quantity };
    
    // Optimistic update
    setItems(prev =>
      prev.map(item => item.id === productId ? updatedItem : item)
    );
    
    try {
      const transaction = db.transaction('cart', 'readwrite');
      const store = transaction.objectStore('cart');
      await new Promise((resolve, reject) => {
        const request = store.put(updatedItem);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
      notifyOtherTabs();
    } catch (error) {
      console.error('Failed to update quantity:', error);
      setItems(prev =>
        prev.map(item => item.id === productId ? { ...item, quantity: item.quantity } : item)
      );
    }
  };

  const removeItem = async (productId) => {
    if (!db) return;

    const removedItem = items.find(item => item.id === productId);
    
    // Optimistic update
    setItems(prev => prev.filter(item => item.id !== productId));
    
    try {
      const transaction = db.transaction('cart', 'readwrite');
      const store = transaction.objectStore('cart');
      await new Promise((resolve, reject) => {
        const request = store.delete(productId);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
      notifyOtherTabs();
    } catch (error) {
      console.error('Failed to remove item:', error);
      if (removedItem) {
        setItems(prev => [...prev, removedItem]);
      }
    }
  };

  const clearCart = async () => {
    if (!db) return;

    const oldItems = [...items];
    
    // Optimistic update
    setItems([]);
    
    try {
      const transaction = db.transaction('cart', 'readwrite');
      const store = transaction.objectStore('cart');
      await new Promise((resolve, reject) => {
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
      notifyOtherTabs();
    } catch (error) {
      console.error('Failed to clear cart:', error);
      setItems(oldItems);
    }
  };

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
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
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
        <p className="text-gray-500">Loading cart...</p>
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
            className="text-red-500 hover:text-red-600"
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
                  className="text-red-500 hover:text-red-600"
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
        <h1 className="text-3xl font-bold mb-6">Shopping Cart Demo (with IndexedDB)</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ProductList />
          <ShoppingCart />
        </div>
      </div>
    </CartProvider>
  );
};

export default App;