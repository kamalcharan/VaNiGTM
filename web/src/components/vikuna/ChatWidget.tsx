// src/components/vikuna/ChatWidget.tsx
import React, { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { MessageCircle, X, Send, Minimize2 } from 'lucide-react';

const ChatContainer = styled.div<{ $isOpen: boolean }>`
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 1000;
  font-family: 'Inter', sans-serif;

  @media (max-width: 768px) {
    bottom: 10px;
    right: 10px;
    left: 10px;
  }
`;

const ChatButton = styled.button<{ $isOpen: boolean }>`
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: linear-gradient(135deg, #06d5cd 0%, #18aa99 100%);
  border: none;
  color: white;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(6, 213, 205, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
  position: relative;

  &:hover {
    transform: scale(1.05);
    box-shadow: 0 6px 20px rgba(6, 213, 205, 0.4);
  }

  svg {
    width: 28px;
    height: 28px;
  }

  @media (max-width: 768px) {
    width: 56px;
    height: 56px;

    svg {
      width: 24px;
      height: 24px;
    }
  }
`;

const ChatBadge = styled.span`
  position: absolute;
  top: -5px;
  right: -5px;
  background-color: #c4454d;
  color: white;
  border-radius: 50%;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
`;

const ChatWindow = styled.div<{ $isOpen: boolean; $isMinimized: boolean }>`
  position: absolute;
  bottom: ${props => props.$isMinimized ? '-400px' : '80px'};
  right: 0;
  width: 380px;
  height: ${props => props.$isMinimized ? '60px' : '550px'};
  background: white;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
  display: ${props => props.$isOpen ? 'flex' : 'none'};
  flex-direction: column;
  overflow: hidden;
  transition: all 0.3s ease;

  @media (max-width: 768px) {
    width: calc(100vw - 20px);
    height: ${props => props.$isMinimized ? '60px' : 'calc(100vh - 100px)'};
    bottom: ${props => props.$isMinimized ? '-500px' : '70px'};
  }
`;

const ChatHeader = styled.div`
  background: linear-gradient(135deg, #06d5cd 0%, #18aa99 100%);
  color: white;
  padding: 16px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const ChatHeaderInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const ChatAvatar = styled.div`
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: white;
  color: #06d5cd;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 16px;
`;

const ChatHeaderText = styled.div`
  h4 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }

  p {
    margin: 0;
    font-size: 12px;
    opacity: 0.9;
  }
`;

const ChatHeaderActions = styled.div`
  display: flex;
  gap: 8px;
`;

const IconButton = styled.button`
  background: none;
  border: none;
  color: white;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.9;
  transition: opacity 0.2s;

  &:hover {
    opacity: 1;
  }

  svg {
    width: 20px;
    height: 20px;
  }
`;

const ChatBody = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  background: #f8f9fa;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const Message = styled.div<{ $isUser: boolean }>`
  display: flex;
  justify-content: ${props => props.$isUser ? 'flex-end' : 'flex-start'};
  animation: slideIn 0.3s ease;

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;

const MessageBubble = styled.div<{ $isUser: boolean }>`
  max-width: 75%;
  padding: 10px 14px;
  border-radius: 12px;
  background: ${props => props.$isUser ? '#06d5cd' : 'white'};
  color: ${props => props.$isUser ? 'white' : '#333'};
  font-size: 14px;
  line-height: 1.5;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
`;

const QuickOptions = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
`;

const QuickButton = styled.button`
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 14px;
  color: #333;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s;

  &:hover {
    background: #f8f9fa;
    border-color: #06d5cd;
    color: #06d5cd;
  }
`;

const ChatFooter = styled.div`
  padding: 16px;
  border-top: 1px solid #e0e0e0;
  background: white;
`;

const InputContainer = styled.form`
  display: flex;
  gap: 8px;
  align-items: center;
`;

const ChatInput = styled.input`
  flex: 1;
  padding: 10px 14px;
  border: 1px solid #e0e0e0;
  border-radius: 24px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;

  &:focus {
    border-color: #06d5cd;
  }
`;

const SendButton = styled.button`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #06d5cd;
  border: none;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;

  &:hover {
    background: #18aa99;
    transform: scale(1.05);
  }

  &:disabled {
    background: #ccc;
    cursor: not-allowed;
    transform: none;
  }

  svg {
    width: 18px;
    height: 18px;
  }
`;

const TypingIndicator = styled.div`
  display: flex;
  gap: 4px;
  padding: 10px 14px;
  background: white;
  border-radius: 12px;
  width: fit-content;

  span {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #06d5cd;
    animation: typing 1.4s infinite;

    &:nth-child(2) {
      animation-delay: 0.2s;
    }

    &:nth-child(3) {
      animation-delay: 0.4s;
    }
  }

  @keyframes typing {
    0%, 60%, 100% {
      opacity: 0.3;
      transform: scale(0.8);
    }
    30% {
      opacity: 1;
      transform: scale(1);
    }
  }
`;

interface ChatMessage {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
}

const ChatWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      text: 'Hi! 👋 Welcome to Vikuna. How can I help you today?',
      isUser: false,
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showQuickOptions, setShowQuickOptions] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Show chat button after 10 seconds or 50% scroll
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsOpen(false);
    }, 10000);

    const handleScroll = () => {
      const scrollPercentage = (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100;
      if (scrollPercentage > 50) {
        clearTimeout(timer);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      text: inputValue,
      isUser: true,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setShowQuickOptions(false);
    setIsTyping(true);

    // Simulate AI response (replace with actual API call later)
    setTimeout(() => {
      const botMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        text: 'Thanks for reaching out! An AI specialist will respond shortly. Meanwhile, would you like to book a consultation?',
        isUser: false,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, botMessage]);
      setIsTyping(false);
    }, 1500);
  };

  const handleQuickOption = (option: string) => {
    setInputValue(option);
    setShowQuickOptions(false);
  };

  return (
    <ChatContainer $isOpen={isOpen}>
      <ChatButton
        $isOpen={isOpen}
        onClick={() => {
          setIsOpen(!isOpen);
          setIsMinimized(false);
        }}
        aria-label="Toggle chat"
      >
        {isOpen ? <X /> : <MessageCircle />}
        {!isOpen && <ChatBadge>1</ChatBadge>}
      </ChatButton>

      <ChatWindow $isOpen={isOpen} $isMinimized={isMinimized}>
        <ChatHeader>
          <ChatHeaderInfo>
            <ChatAvatar>V</ChatAvatar>
            <ChatHeaderText>
              <h4>Vikuna AI Assistant</h4>
              <p>Typically replies instantly</p>
            </ChatHeaderText>
          </ChatHeaderInfo>
          <ChatHeaderActions>
            <IconButton onClick={() => setIsMinimized(!isMinimized)} aria-label="Minimize">
              <Minimize2 />
            </IconButton>
            <IconButton onClick={() => setIsOpen(false)} aria-label="Close">
              <X />
            </IconButton>
          </ChatHeaderActions>
        </ChatHeader>

        <ChatBody>
          {messages.map(message => (
            <Message key={message.id} $isUser={message.isUser}>
              <MessageBubble $isUser={message.isUser}>
                {message.text}
              </MessageBubble>
            </Message>
          ))}

          {isTyping && (
            <Message $isUser={false}>
              <TypingIndicator>
                <span></span>
                <span></span>
                <span></span>
              </TypingIndicator>
            </Message>
          )}

          {showQuickOptions && messages.length === 1 && (
            <QuickOptions>
              <QuickButton onClick={() => handleQuickOption('I want to discuss CDO/CAiO services')}>
                💼 CDO/CAiO Services
              </QuickButton>
              <QuickButton onClick={() => handleQuickOption('Tell me about your AI products')}>
                🚀 AI Products
              </QuickButton>
              <QuickButton onClick={() => handleQuickOption('I need help launching an MVP')}>
                ⚡ MVP Development
              </QuickButton>
              <QuickButton onClick={() => handleQuickOption('Download free resources')}>
                📚 Free Resources
              </QuickButton>
            </QuickOptions>
          )}

          <div ref={messagesEndRef} />
        </ChatBody>

        <ChatFooter>
          <InputContainer onSubmit={handleSendMessage}>
            <ChatInput
              type="text"
              placeholder="Type your message..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
            />
            <SendButton type="submit" disabled={!inputValue.trim()}>
              <Send />
            </SendButton>
          </InputContainer>
        </ChatFooter>
      </ChatWindow>
    </ChatContainer>
  );
};

export default ChatWidget;
