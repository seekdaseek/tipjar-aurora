import React, {useState} from 'react';
import {View,Text,TouchableOpacity,StyleSheet,Share,ScrollView,Image,Linking} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RouteProp} from '@react-navigation/native';
import {RootStackParamList} from '../../App';
type Props = {navigation: NativeStackNavigationProp<RootStackParamList,'Tip'>;route: RouteProp<RootStackParamList,'Tip'>};
const AMOUNTS = ['0.05','0.1','0.25','0.5','1','2'];
const WALLETS = [
  {id:'phantom',emoji:'👻',name:'Phantom',url:(u:string)=>`phantom://v1/transfer?to=${u.split('?')[0].replace('solana:','')}&${u.split('?')[1]}`},
  {id:'metamask',emoji:'🦊',name:'MetaMask',url:(u:string)=>`metamask://send?to=${u.split('?')[0].replace('solana:','')}`},
];
export default function TipScreen({navigation,route}: Props) {
  const {name,wallet,color} = route.params;
  const [amount,setAmount]=useState('0.1');
  const solanaPayUrl = `solana:${wallet}?amount=${amount}&label=${encodeURIComponent(name)}&message=${encodeURIComponent('Tip via Tip Jar')}`;
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&margin=16&data=${encodeURIComponent(solanaPayUrl)}`;
  const openWallet = async (walletId: string) => {
    const w = WALLETS.find(x=>x.id===walletId);
    if(w) await Linking.openURL(w.url(solanaPayUrl)).catch(()=>{});
  };
  const sharePayment = async () => {
    await Share.share({message: wallet});
  };
  return (
    <SafeAreaView style={s.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.creatorRow}>
          <View style={[s.avatar,{backgroundColor:color}]}><Text style={s.avatarText}>{name[0]}</Text></View>
          <View><Text style={s.creatorName}>{name}</Text><Text style={s.creatorSub}>Scan to tip with any Solana wallet</Text></View>
        </View>
        <TouchableOpacity style={s.magicBtn} onPress={()=>navigation.navigate('AnyChain',{name,wallet,color})}>
          <Text style={s.magicBtnEmoji}>🌐</Text>
          <View style={{flex:1}}><Text style={s.magicBtnTitle}>Tip from any chain</Text><Text style={s.magicBtnSub}>Pay with ETH, BTC, USDC on Base and more. {name} gets USDC on Solana.</Text></View>
        </TouchableOpacity>
        <Text style={s.sectionLabel}>Choose amount</Text>
        <View style={s.amountGrid}>
          {AMOUNTS.map(a=>(
            <TouchableOpacity key={a} style={[s.amountBtn,amount===a&&s.amountBtnActive]} onPress={()=>setAmount(a)}>
              <Text style={[s.amountBtnText,amount===a&&s.amountBtnTextActive]}>◎ {a}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={s.qrCard}>
          <Text style={s.qrAmount}>◎ {amount} SOL to {name}</Text>
          <Image source={{uri:qrImageUrl}} style={s.qrImage} resizeMode="contain"/>
          <Text style={s.orText}>— or open wallet directly —</Text>
          <View style={s.walletGrid}>
            {WALLETS.map(w=>(
              <TouchableOpacity key={w.id} style={s.walletBtn} onPress={()=>openWallet(w.id)}>
                <Text style={s.walletEmoji}>{w.emoji}</Text>
                <Text style={s.walletName}>{w.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <Text style={s.instructionTitle}>How to tip</Text>
        {['Open your Solana wallet','Tap the scan / camera icon','Point at the QR — amount is pre-filled','Confirm the transaction'].map((t,i)=>(
          <View key={i} style={s.step}>
            <View style={s.stepNum}><Text style={s.stepNumText}>{i+1}</Text></View>
            <Text style={s.stepText}>{t}</Text>
          </View>
        ))}

        <TouchableOpacity style={s.shareBtn} onPress={sharePayment}>
          <Text style={s.shareBtnText}>📤 Share wallet address</Text>
        </TouchableOpacity>
        <Text style={s.disclaimer}>Tips go directly to {name}'s wallet. Zero fees.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
const s=StyleSheet.create({
  container:{flex:1,backgroundColor:'#0A0A14'},
  scroll:{padding:20,paddingBottom:40},
  creatorRow:{flexDirection:'row',alignItems:'center',gap:14,marginBottom:24,backgroundColor:'#131320',borderRadius:14,padding:14,borderWidth:1,borderColor:'#1E1E30'},
  avatar:{width:48,height:48,borderRadius:24,alignItems:'center',justifyContent:'center'},
  avatarText:{color:'#FFF',fontSize:20,fontWeight:'800'},
  creatorName:{color:'#F9FAFB',fontSize:16,fontWeight:'700'},
  creatorSub:{color:'#6B7280',fontSize:12,marginTop:2},
  sectionLabel:{color:'#6B7280',fontSize:11,fontWeight:'700',textTransform:'uppercase',letterSpacing:1,marginBottom:10},
  amountGrid:{flexDirection:'row',flexWrap:'wrap',gap:8,marginBottom:24},
  amountBtn:{backgroundColor:'#131320',borderRadius:10,paddingHorizontal:16,paddingVertical:10,borderWidth:1,borderColor:'#1E1E30'},
  amountBtnActive:{backgroundColor:'#4C1D95',borderColor:'#7C3AED'},
  amountBtnText:{color:'#6B7280',fontSize:14,fontWeight:'600'},
  amountBtnTextActive:{color:'#C4B5FD'},
  qrCard:{backgroundColor:'#131320',borderRadius:16,padding:20,borderWidth:1,borderColor:'#1E1E30',marginBottom:24,alignItems:'center'},
  qrAmount:{color:'#C4B5FD',fontSize:15,fontWeight:'700',marginBottom:16},
  qrImage:{width:220,height:220,borderRadius:12},
  orText:{color:'#4B5563',fontSize:11,textAlign:'center',marginTop:20,marginBottom:12},
  walletGrid:{flexDirection:'row',gap:10,justifyContent:'center',width:'100%'},
  walletBtn:{flex:1,backgroundColor:'#0A0A14',borderRadius:12,paddingVertical:12,borderWidth:1,borderColor:'#1E1E30',alignItems:'center'},
  walletEmoji:{fontSize:22,marginBottom:4},
  walletName:{color:'#9CA3AF',fontSize:11,fontWeight:'600'},
  instructionTitle:{color:'#F9FAFB',fontSize:15,fontWeight:'700',marginBottom:12},
  step:{flexDirection:'row',alignItems:'flex-start',gap:12,marginBottom:10},
  stepNum:{width:24,height:24,borderRadius:12,backgroundColor:'#4C1D95',alignItems:'center',justifyContent:'center'},
  stepNumText:{color:'#C4B5FD',fontSize:12,fontWeight:'700'},
  stepText:{color:'#9CA3AF',fontSize:13,lineHeight:20,flex:1},
  magicBtn:{flexDirection:'row',alignItems:'center',gap:14,backgroundColor:'#1a1200',borderRadius:14,padding:16,marginBottom:12,borderWidth:1.5,borderColor:'#C9A84C'},
  magicBtnEmoji:{fontSize:28},
  magicBtnTitle:{color:'#E8C454',fontSize:15,fontWeight:'700'},
  magicBtnSub:{color:'#92794A',fontSize:12,marginTop:2},
  shareBtn:{borderWidth:1,borderColor:'#4C1D95',borderRadius:14,padding:14,alignItems:'center',marginBottom:16},
  shareBtnText:{color:'#C4B5FD',fontSize:15,fontWeight:'600'},
  disclaimer:{color:'#4B5563',fontSize:12,textAlign:'center'},
});
