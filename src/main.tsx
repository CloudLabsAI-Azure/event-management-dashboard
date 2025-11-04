import { createRoot } from 'react-dom/client'
import { MsalProvider } from "@azure/msal-react";
import { PublicClientApplication } from "@azure/msal-browser";
import { msalConfig } from "./lib/msalConfig";
import { azureApiClient } from "./lib/azureApiClient";
import App from './App.tsx'
import './index.css'

// Initialize MSAL instance
const msalInstance = new PublicClientApplication(msalConfig);

// Initialize MSAL instance before rendering
msalInstance.initialize().then(() => {
	console.log('MSAL initialized successfully');
	
	// Handle redirect response if coming back from B2C
	return msalInstance.handleRedirectPromise();
}).then((response) => {
	if (response) {
		console.log('B2C redirect response received:', response);
	}
	
	// Initialize Azure API client with MSAL instance
	azureApiClient.setMsalInstance(msalInstance);
	
	try {
		createRoot(document.getElementById("root")!).render(
			<MsalProvider instance={msalInstance}>
				<App />
			</MsalProvider>
		);
		console.log('App rendered successfully');
	} catch (err) {
		console.error('App render error:', err);
		const root = document.getElementById('root');
		if (root) {
			root.innerHTML = `
				<div style="padding: 20px; font-family: Arial, sans-serif;">
					<h2 style="color: #c53030;">Application Error</h2>
					<pre style="white-space: pre-wrap; color: #c53030; background: #fff5f5; padding: 16px; border-radius: 6px; border: 1px solid #feb2b2;">
						${String(err)}
					</pre>
					<p style="margin-top: 16px; color: #4a5568;">Please refresh the page or contact support if the problem persists.</p>
				</div>
			`;
		}
	}
}).catch(err => {
	console.error('MSAL initialization failed:', err);
	const root = document.getElementById('root');
	if (root) {
		root.innerHTML = `
			<div style="padding: 20px; font-family: Arial, sans-serif;">
				<h2 style="color: #c53030;">Authentication Initialization Error</h2>
				<pre style="white-space: pre-wrap; color: #c53030; background: #fff5f5; padding: 16px; border-radius: 6px; border: 1px solid #feb2b2;">
					${String(err)}
				</pre>
				<p style="margin-top: 16px; color: #4a5568;">There was an issue initializing the authentication system. Please refresh the page or contact support.</p>
			</div>
		`;
	}
});
