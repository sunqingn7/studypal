import { useState, useEffect, useRef } from 'react'
import { useNotificationStore, Notification } from '../../application/store/notification-store'
import { Bell, X, Check, AlertTriangle, AlertCircle, Info, CheckCircle } from 'lucide-react'

export function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllAsRead, removeNotification } = useNotificationStore()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const getIcon = (type: Notification['type']) => {
    switch (type) {
      case 'error': return <AlertCircle size={16} className="text-red-500" />
      case 'warning': return <AlertTriangle size={16} className="text-yellow-500" />
      case 'success': return <CheckCircle size={16} className="text-green-500" />
      default: return <Info size={16} className="text-blue-500" />
    }
  }

  const formatTime = (timestamp: number) => {
    const now = Date.now()
    const diff = now - timestamp
    if (diff < 60000) return 'Just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return new Date(timestamp).toLocaleDateString()
  }

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed left-2 top-20 z-50 p-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded shadow-md hover:bg-[var(--bg-tertiary)] transition-colors"
        title="Notifications"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="fixed left-2 top-28 z-50 w-80 max-h-96 overflow-y-auto bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg shadow-lg">
          <div className="flex items-center justify-between p-3 border-b border-[var(--border-color)]">
            <h3 className="font-semibold text-sm">Notifications</h3>
            <div className="flex gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-xs text-[var(--accent-color)] hover:underline flex items-center gap-1"
                >
                  <Check size={12} /> Mark all read
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {notifications.length === 0 ? (
            <div className="p-6 text-center text-[var(--text-secondary)] text-sm">
              No notifications
            </div>
          ) : (
            <div className="divide-y divide-[var(--border-color)]">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-3 hover:bg-[var(--bg-tertiary)] transition-colors ${
                    !notification.read ? 'bg-[var(--bg-tertiary)]' : ''
                  }`}
                  onClick={() => markAsRead(notification.id)}
                >
                  <div className="flex items-start gap-2">
                    {getIcon(notification.type)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium truncate">{notification.title}</p>
                        <span className="text-xs text-[var(--text-secondary)] ml-2 shrink-0">
                          {formatTime(notification.timestamp)}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2">
                        {notification.message}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        removeNotification(notification.id)
                      }}
                      className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] shrink-0"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
