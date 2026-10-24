import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AuthProvider } from './auth/AuthProvider'
import { consumeAuthReturn } from './auth/auth-return'
import './styles.css'
import './auth/auth.css'

// Remove callback credentials before any child starts requests or renders.
const callback = consumeAuthReturn()
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><AuthProvider callback={callback}><App /></AuthProvider></React.StrictMode>,
)
