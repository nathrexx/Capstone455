import React, { useState, useEffect, useRef } from 'react';
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import { useNavigate } from 'react-router-dom';
import EmojiPicker, { type EmojiClickData } from 'emoji-picker-react';
import CryptoJS from 'crypto-js';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import './Home.css';

const ENCRYPTION_KEY = 'secure-chat-encryption-key';


interface User {
  socketId: string;
  userId: number | string;
  name: string;
  email: string | null;
}

interface FileAttachment {
  name: string;
  type: string;
  size: number;
  data: string; 
  encrypted: boolean;
}

interface Message {
  id: string;
  sender: string;
  senderName?: string;
  receiver: string;
  text: string;
  timestamp: Date;
  read?: boolean;
  attachment?: FileAttachment;
  isFormatted?: boolean;
}

interface ChatState {
  [key: string]: Message[]; // key is socketId of other person
}

interface TypingState {
  [key: string]: boolean; // key is userId, value is whether they're typing
}

const Home: React.FC = () => {
  const navigate = useNavigate();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [message, setMessage] = useState('');
  const [chats, setChats] = useState<ChatState>({});
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [typing, setTyping] = useState<TypingState>({});
  const [isTyping, setIsTyping] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isFormatting, setIsFormatting] = useState(false);
  
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  
  useEffect(() => {
    
    const userDataString = localStorage.getItem('user');
    if (!userDataString) {
      console.error('No user data found, redirecting to login');
      navigate('/');
      return;
    }
    
    try {
      const userData = JSON.parse(userDataString);
      
      const socketIo = io('https://localhost:8081', {
        rejectUnauthorized: false 
      });

      socketIo.on('connect', () => {
        console.log('Connected to socket server with ID:', socketIo.id);
        
        
        const currentUserData: User = {
          socketId: socketIo.id,
          userId: userData.id,
          name: userData.name,
          email: userData.email
        };
        
        setCurrentUser(currentUserData);
        
        
        socketIo.emit('authenticate', {
          id: userData.id,
          name: userData.name,
          email: userData.email
        });
      });

      socketIo.on('users_list', (usersList: User[]) => {
        console.log('Received users list:', usersList);
        
        const filteredUsers = usersList.filter(u => u.socketId !== socketIo.id);
        setUsers(filteredUsers);
        
        
        const initialChats: ChatState = {};
        usersList.forEach(user => {
          if (user.socketId !== socketIo.id && !chats[user.socketId]) {
            initialChats[user.socketId] = [];
          }
        });
        
        if (Object.keys(initialChats).length > 0) {
          setChats(prev => ({ ...prev, ...initialChats }));
        }
        
        
        if (!selectedUser && filteredUsers.length > 0) {
          setSelectedUser(filteredUsers[0]);
        }
      });

      socketIo.on('chat message', (msg: Message) => {
        console.log('Received message:', msg);
        
        
        setChats(prevChats => {
          const chatUserId = msg.sender === socketIo.id ? msg.receiver : msg.sender;
          
          
          const messageExists = prevChats[chatUserId]?.some(m => m.id === msg.id);
          
          if (messageExists) {
            return prevChats; 
          }
          
          
          let processedMsg = { ...msg };
          if (msg.attachment?.encrypted) {
            try {
              const decryptedData = CryptoJS.AES.decrypt(
                msg.attachment.data, 
                ENCRYPTION_KEY
              ).toString(CryptoJS.enc.Utf8);
              
              processedMsg = {
                ...msg,
                attachment: {
                  ...msg.attachment,
                  data: decryptedData,
                  encrypted: false
                }
              };
            } catch (error) {
              console.error('Error decrypting file:', error);
            }
          }
          
          const updatedMessages = [...(prevChats[chatUserId] || []), {
            ...processedMsg,
            timestamp: new Date(msg.timestamp)
          }];
          
          return {
            ...prevChats,
            [chatUserId]: updatedMessages
          };
        });
        
        
        if (msg.sender !== socketIo.id && selectedUser && msg.sender === selectedUser.socketId) {
          socketIo.emit('message_read', { messageId: msg.id, reader: socketIo.id });
        }
      });

      
      socketIo.on('message_read', (data: { messageId: string, reader: string }) => {
       
        setChats(prevChats => {
          const updatedChats = { ...prevChats };
          
          
          Object.keys(updatedChats).forEach(userId => {
            updatedChats[userId] = updatedChats[userId].map(msg => 
              msg.id === data.messageId ? { ...msg, read: true } : msg
            );
          });
          
          return updatedChats;
        });
      });

      socketIo.on('user_connected', (user: User) => {
        console.log('User connected:', user);
        setUsers(prev => {
          if (!prev.some(u => u.socketId === user.socketId)) {
            return [...prev, user];
          }
          return prev;
        });
        
        
        setChats(prev => {
          if (!prev[user.socketId]) {
            return { ...prev, [user.socketId]: [] };
          }
          return prev;
        });
      });

      socketIo.on('user_disconnected', (user: User) => {
        console.log('User disconnected:', user);
        setUsers(prev => prev.filter(u => u.socketId !== user.socketId));
        
        if (selectedUser && user.socketId === selectedUser.socketId) {
          const remainingUsers = users.filter(u => u.socketId !== user.socketId);
          if (remainingUsers.length > 0) {
            setSelectedUser(remainingUsers[0]);
          } else {
            setSelectedUser(null);
          }
        }
      });

      socketIo.on('typing', (data: { user: User, isTyping: boolean, receiver: string }) => {
        if (data.user.socketId !== socketIo.id) {
          setTyping(prev => ({ ...prev, [data.user.socketId]: data.isTyping }));
        }
      });

      socketIo.on('disconnect', () => {
        console.log('Disconnected from socket server');
      });

      setSocket(socketIo);

      return () => {
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }
        socketIo.disconnect();
      };
    } catch (error) {
      console.error('Error parsing user data:', error);
      navigate('/');
    }
  }, [navigate]);

  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      
      // Limit file size (5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert('File size exceeds 5MB limit');
        e.target.value = ''; 
        return;
      }
      
      setSelectedFile(file);
    }
  };
  
  const handleFileButtonClick = () => {
    fileInputRef.current?.click();
  };
  
  // Encrypt file and convert to base64
  const encryptFile = (file: File): Promise<FileAttachment> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (event) => {
        try {
          if (!event.target || !event.target.result) {
            throw new Error('Failed to read file');
          }
          
          const fileData = event.target.result.toString();
          
          // Encrypt the file data
          const encryptedData = CryptoJS.AES.encrypt(
            fileData,
            ENCRYPTION_KEY
          ).toString();
          
          resolve({
            name: file.name,
            type: file.type,
            size: file.size,
            data: encryptedData,
            encrypted: true
          });
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = () => {
        reject(new Error('Error reading file'));
      };
      
      reader.readAsDataURL(file);
    });
  };
  
  // Handle emoji 
  const onEmojiClick = (emojiData: EmojiClickData) => {
    setMessage(prev => prev + emojiData.emoji);
    setShowEmojiPicker(false);
  };
  
  // Format text
  const applyFormat = (format: string) => {
    switch (format) {
      case 'bold':
        setMessage(prev => `**${prev}**`);
        break;
      case 'italic':
        setMessage(prev => `*${prev}*`);
        break;
      case 'link':
        setMessage(prev => `[${prev}](url)`);
        break;
      case 'code':
        setMessage(prev => `\`${prev}\``);
        break;
      default:
        break;
    }
  };
  
  const toggleFormatting = () => {
    setIsFormatting(!isFormatting);
    setShowEmojiPicker(false);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!message.trim() && !selectedFile) || !selectedUser || !socket || !currentUser) return;

    try {
      let attachment: FileAttachment | undefined;
      
      if (selectedFile) {
        attachment = await encryptFile(selectedFile);
      }
      
      const newMessage: Message = {
        id: Date.now().toString(),
        sender: currentUser.socketId,
        senderName: currentUser.name,
        receiver: selectedUser.socketId,
        text: message,
        timestamp: new Date(),
        read: false,
        attachment,
        isFormatted: message.includes('*') || message.includes('`') || message.includes('[')
      };

      socket.emit('chat message', newMessage);

      setIsTyping(false);
      setMessage('');
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
      if (socket) {
        socket.emit('typing', { 
          user: currentUser, 
          receiver: selectedUser.socketId, 
          isTyping: false 
        });
      }
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Failed to send message. Please try again.');
    }
  };

  const downloadAttachment = (attachment: FileAttachment) => {
    try {
      const linkElement = document.createElement('a');
      linkElement.href = attachment.data;
      linkElement.download = attachment.name;
      document.body.appendChild(linkElement);
      linkElement.click();
      document.body.removeChild(linkElement);
    } catch (error) {
      console.error('Error downloading file:', error);
      alert('Failed to download file.');
    }
  };

  const handleMessageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessage(e.target.value);
    if (!isTyping && e.target.value.length > 0) {
      setIsTyping(true);
    } else if (e.target.value.length === 0) {
      setIsTyping(false);
      if (socket && selectedUser) {
        socket.emit('typing', { 
          user: currentUser, 
          receiver: selectedUser.socketId, 
          isTyping: false 
        });
      }
    }
  };

  const selectUser = (user: User) => {
    setSelectedUser(user);
    
    const unreadMessages = chats[user.socketId]?.filter(msg => 
      msg.sender === user.socketId && !msg.read
    );
    
    if (unreadMessages?.length && socket) {
      unreadMessages.forEach(msg => {
        socket.emit('message_read', { 
          messageId: msg.id, 
          reader: currentUser?.socketId 
        });
      });
    }
  };

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getUnreadCount = (socketId: string) => {
    return chats[socketId]?.filter(msg => msg.sender === socketId && !msg.read).length || 0;
  };

  // Logout handler
  const handleLogout = () => {
    localStorage.removeItem('user');
    if (socket) {
      socket.disconnect();
    }
    navigate('/');
  };

  return (
    <div className="chat-container">
      <div className="chat-sidebar">
        <div className="current-user">
          <h3>You: {currentUser?.name || 'Loading...'}</h3>
          <button onClick={handleLogout} className="logout-btn">Logout</button>
        </div>
        <h3>Online Users</h3>
        <ul className="users-list">
          {users.length === 0 ? (
            <li className="no-users">No other users online</li>
          ) : (
            users.map(user => (
              <li 
                key={user.socketId} 
                className={`user-item ${selectedUser?.socketId === user.socketId ? 'selected' : ''} ${getUnreadCount(user.socketId) > 0 ? 'has-unread' : ''}`}
                onClick={() => selectUser(user)}
              >
                {user.name}
                {getUnreadCount(user.socketId) > 0 && (
                  <span className="unread-badge">{getUnreadCount(user.socketId)}</span>
                )}
              </li>
            ))
          )}
        </ul>
      </div>

      <div className="chat-main">
        {selectedUser ? (
          <>
            <div className="chat-header">
              <h2>Chat with: {selectedUser.name}</h2>
            </div>
            
            <div className="chat-messages" ref={chatContainerRef}>
              {!chats[selectedUser.socketId] || chats[selectedUser.socketId].length === 0 ? (
                <div className="no-messages">No messages yet. Start the conversation!</div>
              ) : (
                chats[selectedUser.socketId].map(msg => (
                  <div 
                    key={msg.id} 
                    className={`message ${msg.sender === currentUser?.socketId ? 'sent' : 'received'}`}
                  >
                    {msg.isFormatted ? (
                      <div className="message-content">
                        <ReactMarkdown rehypePlugins={[rehypeSanitize]}>
                          {msg.text}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <div className="message-content">{msg.text}</div>
                    )}
                    
                    {msg.attachment && (
                      <div className="file-attachment" onClick={() => downloadAttachment(msg.attachment!)}>
                        <div className="file-icon">📎</div>
                        <div className="file-info">
                          <div className="file-name">{msg.attachment.name}</div>
                          <div className="file-size">{(msg.attachment.size / 1024).toFixed(1)} KB</div>
                        </div>
                        <div className="file-download">⬇️</div>
                      </div>
                    )}
                    
                    <div className="message-footer">
                      <span className="message-time">{formatTime(msg.timestamp)}</span>
                      {msg.sender === currentUser?.socketId && msg.read && (
                        <span className="read-receipt">✓</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
            
            {typing[selectedUser.socketId] && (
              <div className="typing-indicator">
                <span>{selectedUser.name} is typing...</span>
              </div>
            )}
            
            {isFormatting && (
              <div className="formatting-toolbar">
                <button onClick={() => applyFormat('bold')} title="Bold">
                  <strong>B</strong>
                </button>
                <button onClick={() => applyFormat('italic')} title="Italic">
                  <em>I</em>
                </button>
                <button onClick={() => applyFormat('link')} title="Link">
                  🔗
                </button>
                <button onClick={() => applyFormat('code')} title="Code">
                  &lt;/&gt;
                </button>
              </div>
            )}
            
            {showEmojiPicker && (
              <div className="emoji-picker-container">
                <EmojiPicker onEmojiClick={onEmojiClick} />
              </div>
            )}
            
            <form className="message-form" onSubmit={handleSendMessage}>
              <div className="message-input-container">
                <input
                  type="text"
                  value={message}
                  onChange={handleMessageChange}
                  placeholder="Type your message..."
                  className="message-input"
                />
                <div className="message-controls">
                  <button 
                    type="button" 
                    onClick={() => {
                      setShowEmojiPicker(!showEmojiPicker);
                      setIsFormatting(false);
                    }}
                    className="emoji-button"
                    title="Insert emoji"
                  >
                    😊
                  </button>
                  <button 
                    type="button" 
                    onClick={toggleFormatting}
                    className={`format-button ${isFormatting ? 'active' : ''}`}
                    title="Text formatting"
                  >
                    <strong>F</strong>
                  </button>
                  <button 
                    type="button" 
                    onClick={handleFileButtonClick}
                    className="file-button"
                    title="Attach file"
                  >
                    📎
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                  />
                </div>
              </div>
              {selectedFile && (
                <div className="selected-file">
                  <span>Selected file: {selectedFile.name}</span>
                  <button 
                    type="button" 
                    onClick={() => {
                      setSelectedFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="remove-file"
                  >
                    ✕
                  </button>
                </div>
              )}
              <button type="submit" className="send-button">Send</button>
            </form>
          </>
        ) : (
          <div className="select-user-prompt">
            <h2>Select a user to start chatting</h2>
            <p>Choose a user from the sidebar to begin a conversation</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Home;