import { create } from 'zustand'

export interface Notification {
  id: string
  type: 'info' | 'warning' | 'error' | 'success'
  title: string
  message: string
  timestamp: number
  read: boolean
  autoClose?: boolean
  duration?: number
}

interface NotificationState {
  notifications: Notification[]
  unreadCount: number
  
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => string
  markAsRead: (id: string) => void
  markAllAsRead: () => void
  removeNotification: (id: string) => void
  clearAll: () => void
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,

  addNotification: (notification) => {
    const id = crypto.randomUUID()
    const newNotification: Notification = {
      ...notification,
      id,
      timestamp: Date.now(),
      read: false,
    }

    set((state) => ({
      notifications: [newNotification, ...state.notifications].slice(0, 50),
      unreadCount: state.unreadCount + 1,
    }))

    if (notification.autoClose !== false) {
      const duration = notification.duration || 5000
      setTimeout(() => {
        get().removeNotification(id)
      }, duration)
    }

    return id
  },

  markAsRead: (id) => {
    set((state) => {
      const notification = state.notifications.find(n => n.id === id)
      if (!notification || notification.read) return state
      
      return {
        notifications: state.notifications.map(n => 
          n.id === id ? { ...n, read: true } : n
        ),
        unreadCount: Math.max(0, state.unreadCount - 1),
      }
    })
  },

  markAllAsRead: () => {
    set((state) => ({
      notifications: state.notifications.map(n => ({ ...n, read: true })),
      unreadCount: 0,
    }))
  },

  removeNotification: (id) => {
    set((state) => {
      const notification = state.notifications.find(n => n.id === id)
      return {
        notifications: state.notifications.filter(n => n.id !== id),
        unreadCount: notification && !notification.read 
          ? Math.max(0, state.unreadCount - 1) 
          : state.unreadCount,
      }
    })
  },

  clearAll: () => {
    set({ notifications: [], unreadCount: 0 })
  },
}))
