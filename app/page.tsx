"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Mic, MicOff, Volume2, VolumeX, Send, Square, MessageCircle, Phone, Radio } from "lucide-react"

type Message = {
  id: string
  text: string
  sender: "user" | "bot"
  timestamp: Date
  type?: "text" | "status" | "error"
}

type ChatMode = "chat" | "voice" | "voice-cont"

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
  resultIndex: number
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string
  message: string
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  abort(): void
  onstart: ((this: SpeechRecognition, ev: Event) => any) | null
  onend: ((this: SpeechRecognition, ev: Event) => any) | null
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any) | null
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition
    webkitSpeechRecognition: new () => SpeechRecognition
  }
}

export default function VoiceAssistant() {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputText, setInputText] = useState("")
  const [currentMode, setCurrentMode] = useState<ChatMode>("chat")
  const [isProcessing, setIsProcessing] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const [speechEnabled, setSpeechEnabled] = useState(true)
  const [isRecording, setIsRecording] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [connectionOnline, setConnectionOnline] = useState(true)

  const chatContainerRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const apiBase = "https://voice-assistant-program.onrender.com"
  const messageCounterRef = useRef(0)

  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition()
        recognitionRef.current.lang = "en-US"
        recognitionRef.current.continuous = false
        recognitionRef.current.interimResults = false
      }
    }
  }, [])

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }, [messages])

  useEffect(() => {
    const handleOnline = () => setConnectionOnline(true)
    const handleOffline = () => setConnectionOnline(false)

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  const addMessage = useCallback((text: string, sender: "user" | "bot", type: "text" | "status" | "error" = "text") => {
    messageCounterRef.current += 1
    const newMessage: Message = {
      id: `${Date.now()}-${messageCounterRef.current}`,
      text,
      sender,
      timestamp: new Date(),
      type,
    }

    setMessages((prev) => [...prev, newMessage])

    if (type === "status") {
      setTimeout(() => {
        setMessages((prev) => prev.filter((msg) => msg.id !== newMessage.id))
      }, 5000)
    }
  }, [])

  const speak = useCallback(
    (text: string) => {
      if (!speechEnabled || !text) return

      if (speechSynthesis.speaking) {
        speechSynthesis.cancel()
      }

      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 0.85
      utterance.pitch = 0.7
      utterance.volume = 1.0

      utterance.onstart = () => setIsSpeaking(true)
      utterance.onend = () => setIsSpeaking(false)
      utterance.onerror = () => setIsSpeaking(false)

      utteranceRef.current = utterance
      speechSynthesis.speak(utterance)
    },
    [speechEnabled],
  )

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isProcessing) return

      if (!connectionOnline) {
        addMessage("❌ No internet connection. Please check your network and try again.", "bot", "error")
        return
      }

      setIsProcessing(true)
      addMessage(text, "user")
      setIsTyping(true)

      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 15000)

        const response = await fetch(`${apiBase}/ask?question=${encodeURIComponent(text)}`, {
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const data = await response.json()
        const answerText = data.answer || "I didn't receive a proper response."

        setIsTyping(false)
        addMessage(answerText, "bot")

        if (speechEnabled) {
          speak(answerText)
        }
      } catch (error) {
        setIsTyping(false)
        console.error("Error:", error)

        let errorMessage = "I'm having trouble connecting right now. "
        if (error instanceof Error && error.name === "AbortError") {
          errorMessage = "Request timed out. Please try again."
        } else if (!navigator.onLine) {
          errorMessage = "You appear to be offline. Please check your internet connection."
        }

        addMessage(`❌ ${errorMessage}`, "bot", "error")
      }

      setIsProcessing(false)
    },
    [isProcessing, connectionOnline, speechEnabled, addMessage, speak],
  )

  const handleSendText = useCallback(() => {
    if (inputText.trim()) {
      sendMessage(inputText.trim())
      setInputText("")
    }
  }, [inputText, sendMessage])

  const startRecording = useCallback(() => {
    if (!recognitionRef.current) {
      addMessage("Voice recognition not supported in this browser", "bot", "error")
      return
    }

    if (isRecording) {
      return
    }

    if (speechSynthesis.speaking) {
      speechSynthesis.cancel()
    }

    setIsRecording(true)

    recognitionRef.current.onstart = () => {
      console.log("Recognition started")
    }

    recognitionRef.current.onresult = (event) => {
      const transcript = event.results[0][0].transcript
      const confidence = event.results[0][0].confidence

      if (currentMode === "chat") {
        setInputText(transcript)
      } else {
        addMessage(transcript, "user")
        sendMessage(transcript)
      }

      setIsRecording(false)
    }

    recognitionRef.current.onerror = (event) => {
      console.error("Speech error:", event.error)
      setIsRecording(false)

      let errorMessage = "Voice recognition error. "
      switch (event.error) {
        case "no-speech":
          errorMessage += "No speech detected. Please try again."
          break
        case "not-allowed":
          errorMessage += "Microphone access denied. Please allow microphone access."
          break
        case "network":
          errorMessage += "Network error. Check your internet connection."
          break
        default:
          errorMessage += "Please try again."
      }

      addMessage(errorMessage, "bot", "error")
    }

    recognitionRef.current.onend = () => {
      setIsRecording(false)
    }

    try {
      recognitionRef.current.start()
    } catch (error) {
      console.error("Failed to start recognition:", error)
      setIsRecording(false)
      addMessage("Failed to start voice recognition. Please try again.", "bot", "error")
    }
  }, [currentMode, addMessage, sendMessage, isRecording])

  const stopRecording = useCallback(() => {
    if (recognitionRef.current && isRecording) {
      recognitionRef.current.stop()
    }
    setIsRecording(false)
  }, [isRecording])

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }, [isRecording, startRecording, stopRecording])

  const toggleSpeaker = useCallback(() => {
    setSpeechEnabled((prev) => {
      const newValue = !prev
      if (!newValue && speechSynthesis.speaking) {
        speechSynthesis.cancel()
      }
      return newValue
    })
  }, [])

  const stopAll = useCallback(() => {
    if (recognitionRef.current && isRecording) {
      recognitionRef.current.stop()
    }
    if (speechSynthesis.speaking) {
      speechSynthesis.cancel()
    }
    setIsRecording(false)
    setIsSpeaking(false)
    setIsProcessing(false)
    setIsTyping(false)
  }, [isRecording])

  const switchMode = useCallback(
    (mode: ChatMode) => {
      stopAll()
      setCurrentMode(mode)
    },
    [stopAll],
  )

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        stopAll()
      } else if (e.ctrlKey && e.key === "m") {
        e.preventDefault()
        if (currentMode === "chat") {
          toggleRecording()
        }
      } else if (e.ctrlKey && e.key === "s") {
        e.preventDefault()
        toggleSpeaker()
      } else if (e.ctrlKey && e.key === "1") {
        e.preventDefault()
        switchMode("chat")
      } else if (e.ctrlKey && e.key === "2") {
        e.preventDefault()
        switchMode("voice")
      } else if (e.ctrlKey && e.key === "3") {
        e.preventDefault()
        switchMode("voice-cont")
      } else if (e.key === " " && currentMode === "voice" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault()
        startRecording()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [currentMode, toggleRecording, toggleSpeaker, switchMode, startRecording, stopAll])

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      <div className="flex gap-0 p-2 bg-card border-b border-border shadow-sm flex-shrink-0 z-10">
        <Button
          variant={currentMode === "chat" ? "default" : "ghost"}
          onClick={() => switchMode("chat")}
          className="flex-1 rounded-r-none"
        >
          <MessageCircle className="w-4 h-4 mr-2" />
          Text
        </Button>
        <Button
          variant={currentMode === "voice" ? "default" : "ghost"}
          onClick={() => switchMode("voice")}
          className="flex-1 rounded-none"
        >
          <Phone className="w-4 h-4 mr-2" />
          Voice
        </Button>
        <Button
          variant={currentMode === "voice-cont" ? "default" : "ghost"}
          onClick={() => switchMode("voice-cont")}
          className="flex-1 rounded-l-none"
        >
          <Radio className="w-4 h-4 mr-2" />
          Continuous
        </Button>
      </div>

      <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth">
        {messages.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-20 text-muted-foreground"
          >
            <h2 className="text-2xl font-semibold mb-2 text-foreground">AI Assistant</h2>
            <p>Send a message or use voice to get started</p>
            {!connectionOnline && (
              <p className="text-destructive mt-2">● Offline - Connect to internet to get started</p>
            )}
            {connectionOnline && <p className="text-green-500 mt-2">● Online</p>}
          </motion.div>
        )}

        <AnimatePresence>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className={`flex ${message.sender === "user" ? "justify-end" : "justify-start"}`}
            >
              <Card
                className={`max-w-[85%] p-4 ${
                  message.sender === "user" ? "bg-primary text-primary-foreground" : "bg-card text-card-foreground"
                } ${message.type === "error" ? "border-destructive" : ""}`}
              >
                <p className="text-sm leading-relaxed break-words">{message.text}</p>
                <p className="text-xs opacity-60 mt-2">
                  {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>

        <AnimatePresence>
          {isTyping && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex justify-start"
            >
              <Card className="bg-card text-card-foreground p-4">
                <div className="flex items-center space-x-2">
                  <span className="text-sm">Generating response</span>
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-muted-foreground rounded-full animate-typing"></div>
                    <div
                      className="w-2 h-2 bg-muted-foreground rounded-full animate-typing"
                      style={{ animationDelay: "0.2s" }}
                    ></div>
                    <div
                      className="w-2 h-2 bg-muted-foreground rounded-full animate-typing"
                      style={{ animationDelay: "0.4s" }}
                    ></div>
                  </div>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex-shrink-0 bg-card border-t border-border p-4 space-y-4">
        {currentMode === "chat" && (
          <div className="flex gap-2 items-center">
            <div className="flex-1 flex gap-2 items-center bg-input border border-border rounded-xl px-4 py-2">
              <Input
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    handleSendText()
                  }
                }}
                placeholder="Message"
                className="flex-1 border-none bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={toggleRecording}
                className={`p-2 ${isRecording ? "animate-pulse-recording text-destructive" : ""}`}
              >
                {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </Button>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={toggleSpeaker}
              className={`p-2 ${isSpeaking ? "animate-pulse-speaking text-primary" : ""} ${!speechEnabled ? "text-muted-foreground" : ""}`}
            >
              {speechEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </Button>
            <Button onClick={handleSendText} size="sm" className="p-2">
              <Send className="w-4 h-4" />
            </Button>
            <Button onClick={stopAll} size="sm" variant="destructive" className="p-2">
              <Square className="w-4 h-4" />
            </Button>
          </div>
        )}

        {currentMode === "voice" && (
          <div className="text-center space-y-4">
            <p className="text-sm text-muted-foreground">Voice Chat Mode - Tap to speak</p>
            <div className="flex justify-center gap-4">
              <Button
                onClick={toggleRecording}
                size="lg"
                className={`p-4 ${isRecording ? "animate-pulse-recording bg-blue-600 hover:bg-blue-700" : ""}`}
              >
                {isRecording ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
              </Button>
              <Button
                onClick={toggleSpeaker}
                size="lg"
                variant="outline"
                className={`p-4 ${isSpeaking ? "animate-pulse-speaking text-primary" : ""} ${!speechEnabled ? "text-muted-foreground" : ""}`}
              >
                {speechEnabled ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
              </Button>
              <Button onClick={stopAll} size="lg" variant="destructive" className="p-4">
                <Square className="w-6 h-6" />
              </Button>
            </div>
          </div>
        )}

        {currentMode === "voice-cont" && (
          <div className="text-center space-y-4">
            <p className="text-sm text-muted-foreground">Continuous listening active</p>
            <div className="flex justify-center gap-4">
              <Button
                onClick={toggleSpeaker}
                size="lg"
                variant="outline"
                className={`p-4 ${isSpeaking ? "animate-pulse-speaking text-primary" : ""} ${!speechEnabled ? "text-muted-foreground" : ""}`}
              >
                {speechEnabled ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
              </Button>
              <Button onClick={stopAll} size="lg" variant="destructive" className="p-4">
                <Square className="w-6 h-6" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
