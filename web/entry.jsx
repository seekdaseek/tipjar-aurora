import React from 'react';
import {createRoot} from 'react-dom/client';
import {View, Text} from 'react-native';
import Screen from '../src/screens/AnyChainTipScreen';

// Same screen component the Android app uses; only the page chrome around it is web-specific.
const nav = {popToTop: () => window.location.reload(), navigate() {}};
const route = {params: {name: 'Nimus', wallet: '4a8o45skRPcyjAdyR8yES215Swvh8uTpZD6KLarhxCJ7', color: '#C9A84C'}};
const link = {color: '#C4B5FD', textDecorationLine: 'underline'};

createRoot(document.getElementById('root')).render(
  <View style={{flex: 1, alignItems: 'center', backgroundColor: '#0A0A14'}}>
    <View style={{flex: 1, width: '100%', maxWidth: 480}}>
      <View style={{padding: 16, paddingBottom: 8}}>
        <Text style={{color: '#F9FAFB', fontSize: 20, fontWeight: '800'}}>⚡ Tip Jar</Text>
        <Text style={{color: '#9CA3AF', fontSize: 13, marginTop: 4}}>Tip a Solana creator from any chain. They receive USDC on Solana.</Text>
        <View style={{backgroundColor: '#1a1200', borderColor: '#C9A84C', borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 10}}>
          <Text style={{color: '#E8C454', fontSize: 12, lineHeight: 18}}>
            Live demo on mainnet: real funds move. Send only the asset and amount the page shows, on the network it names. Minimum tip $1.
          </Text>
        </View>
      </View>
      <Screen navigation={nav} route={route} />
      <View style={{padding: 12}}>
        <Text style={{color: '#6B7280', fontSize: 11, textAlign: 'center', lineHeight: 17}}>
          Encode Solana Hackathon 2026, Aurora Intents track. Routed by Aurora Intents (NEAR Intents) Swap API.{' '}
          <Text href="https://github.com/seekdaseek/tipjar-aurora" hrefAttrs={{target: '_blank', rel: 'noopener noreferrer'}} style={link}>Code</Text>
        </Text>
      </View>
    </View>
  </View>
);
