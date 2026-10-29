import React, {useState} from 'react';
import {View,Text,TouchableOpacity,StyleSheet,Share,ScrollView,Alert,ActivityIndicator,TextInput} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RouteProp} from '@react-navigation/native';
import {RootStackParamList} from '../../App';
type Props = {navigation: NativeStackNavigationProp<RootStackParamList,'MagicLink'>;route: RouteProp<RootStackParamList,'MagicLink'>};
const AMOUNTS = ['0.05','0.1','0.25','0.5','1'];
const genCode = () => {const c='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz123456789';const r=(n:number)=>Array.from({length:n},()=>c[Math.floor(Math.random()*c.length)]).join('');return {pub:r(44),priv:r(88)};};
type Step='choose'|'send'|'share';
export default function MagicLinkScreen({navigation,route}:Props) {
  const {name,wallet,color}=route.params;
  const [step,setStep]=useState<Step>('choose');
  const [amount,setAmount]=useState('0.1');
  const [kp]=useState(genCode());
  const [claimCode,setClaimCode]=useState('');
  const [claiming,setClaiming]=useState(false);
  const code=`TJ-${kp.pub.slice(0,6)}-${kp.priv.slice(0,8)}`.toUpperCase();
  const link=`https://tipjar.app/claim/${kp.pub}?k=${kp.priv.slice(0,16)}&a=${amount}&f=${encodeURIComponent(name)}`;
  const shareLink=async()=>{await Share.share({message:`⚡ You've been sent ◎${amount} SOL!\n\nClaim here: ${link}\n\nOr use code: ${code}\n\nSent via Tip Jar on Solana`,title:`◎${amount} SOL tip`});};
  const handleClaim=async()=>{
    if(!claimCode.trim()){Alert.alert('Enter code');return;}
    setClaiming(true);
    setTimeout(()=>{setClaiming(false);Alert.alert('✅ Claimed!',`SOL has been sent to your wallet.`,[{text:'Done',onPress:()=>navigation.goBack()}]);},2000);
  };
  const si=step==='choose'?0:step==='send'?1:2;
  return (
    <SafeAreaView style={s.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <Text style={s.headerEmoji}>✨</Text>
          <Text style={s.headerTitle}>Magic Link</Text>
          <Text style={s.headerSub}>Send SOL via a shareable link — no wallet needed to receive</Text>
        </View>
        <View style={s.steps}>
          {['Amount','Send','Share'].map((label,i)=>(
            <React.Fragment key={label}>
              <View style={s.si}>
                <View style={[s.sc,i<si&&s.sd,i===si&&s.sa]}><Text style={[s.sct,(i<=si)&&s.scta]}>{i<si?'✓':i+1}</Text></View>
                <Text style={[s.sl,i===si&&s.sla]}>{label}</Text>
              </View>
              {i<2&&<View style={[s.sline,i<si&&s.sld]}/>}
            </React.Fragment>
          ))}
        </View>
        {step==='choose'&&(
          <View style={s.card}>
            <Text style={s.cardTitle}>How much to send?</Text>
            <View style={s.amountGrid}>
              {AMOUNTS.map(a=>(
                <TouchableOpacity key={a} style={[s.amountBtn,amount===a&&s.amountBtnActive]} onPress={()=>setAmount(a)}>
                  <Text style={[s.amountBtnText,amount===a&&s.amountBtnTextActive]}>◎ {a}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={s.recipientRow}>
              <View style={[s.miniAvatar,{backgroundColor:color}]}><Text style={s.miniAvatarText}>{name[0]}</Text></View>
              <View><Text style={s.recipientLabel}>Sending to</Text><Text style={s.recipientName}>{name}</Text></View>
            </View>
            <TouchableOpacity style={s.primaryBtn} onPress={()=>setStep('send')}><Text style={s.primaryBtnText}>Continue →</Text></TouchableOpacity>
          </View>
        )}
        {step==='send'&&(
          <View style={s.card}>
            <Text style={s.cardTitle}>Send ◎{amount} to escrow</Text>
            <Text style={s.cardSub}>This temporary address holds the SOL until claimed.</Text>
            <View style={s.escrowBox}>
              <Text style={s.escrowLabel}>Escrow address</Text>
              <Text style={s.escrowAddress}>{kp.pub}</Text>
            </View>
            <View style={s.infoBox}><Text style={s.infoText}>💡 Open Phantom or Solflare, send exactly ◎{amount} SOL to the address above, then tap "I've sent it".</Text></View>
            <TouchableOpacity style={s.primaryBtn} onPress={()=>setStep('share')}><Text style={s.primaryBtnText}>✓ I've sent it</Text></TouchableOpacity>
            <TouchableOpacity style={s.secondaryBtn} onPress={()=>setStep('choose')}><Text style={s.secondaryBtnText}>← Back</Text></TouchableOpacity>
          </View>
        )}
        {step==='share'&&(
          <View style={s.card}>
            <Text style={s.cardTitle}>Share the magic link 🎉</Text>
            <Text style={s.cardSub}>{name} can claim ◎{amount} SOL with this code</Text>
            <View style={s.magicCodeBox}>
              <Text style={s.magicCodeLabel}>Claim code</Text>
              <Text style={s.magicCode}>{code}</Text>
            </View>
            <TouchableOpacity style={s.shareBtn} onPress={shareLink}><Text style={s.shareBtnText}>📤 Share magic link</Text></TouchableOpacity>
            <View style={s.warningBox}><Text style={s.warningText}>⚠️ Save this code! Unclaimed tips expire in 7 days.</Text></View>
            <TouchableOpacity style={s.primaryBtn} onPress={()=>navigation.goBack()}><Text style={s.primaryBtnText}>Done</Text></TouchableOpacity>
          </View>
        )}
        <View style={[s.card,{marginTop:16}]}>
          <Text style={s.cardTitle}>🎁 Claim a tip</Text>
          <Text style={s.cardSub}>Enter your magic link code to receive SOL</Text>
          <TextInput style={s.claimInput} placeholder="e.g. TJ-ABC123-XYZ456" placeholderTextColor="#4B5563" value={claimCode} onChangeText={setClaimCode} autoCapitalize="characters" autoCorrect={false}/>
          <TouchableOpacity style={[s.claimBtn,claiming&&{opacity:0.6}]} onPress={handleClaim} disabled={claiming}>
            {claiming?<ActivityIndicator color="#12082a"/>:<Text style={s.claimBtnText}>✨ Claim SOL</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
const s=StyleSheet.create({
  container:{flex:1,backgroundColor:'#0A0A14'},scroll:{padding:20,paddingBottom:40},
  header:{alignItems:'center',marginBottom:24},headerEmoji:{fontSize:44,marginBottom:8},
  headerTitle:{color:'#F9FAFB',fontSize:24,fontWeight:'800'},headerSub:{color:'#6B7280',fontSize:13,textAlign:'center',marginTop:4,lineHeight:18},
  steps:{flexDirection:'row',alignItems:'center',justifyContent:'center',marginBottom:24},
  si:{alignItems:'center',gap:4},sc:{width:28,height:28,borderRadius:14,backgroundColor:'#131320',borderWidth:1,borderColor:'#1E1E30',alignItems:'center',justifyContent:'center'},
  sa:{borderColor:'#7C3AED',backgroundColor:'#4C1D95'},sd:{borderColor:'#059669',backgroundColor:'#064E3B'},
  sct:{color:'#4B5563',fontSize:12,fontWeight:'700'},scta:{color:'#FFF'},
  sl:{color:'#4B5563',fontSize:10,fontWeight:'600'},sla:{color:'#C4B5FD'},
  sline:{width:40,height:1,backgroundColor:'#1E1E30',marginBottom:16},sld:{backgroundColor:'#059669'},
  card:{backgroundColor:'#131320',borderRadius:16,padding:20,borderWidth:1,borderColor:'#1E1E30'},
  cardTitle:{color:'#F9FAFB',fontSize:17,fontWeight:'700',marginBottom:6},cardSub:{color:'#6B7280',fontSize:13,marginBottom:16,lineHeight:18},
  amountGrid:{flexDirection:'row',flexWrap:'wrap',gap:8,marginBottom:20},
  amountBtn:{backgroundColor:'#0A0A14',borderRadius:10,paddingHorizontal:16,paddingVertical:10,borderWidth:1,borderColor:'#1E1E30'},
  amountBtnActive:{backgroundColor:'#4C1D95',borderColor:'#7C3AED'},amountBtnText:{color:'#6B7280',fontSize:14,fontWeight:'600'},amountBtnTextActive:{color:'#C4B5FD'},
  recipientRow:{flexDirection:'row',alignItems:'center',gap:10,backgroundColor:'#0A0A14',borderRadius:12,padding:12,marginBottom:20,borderWidth:1,borderColor:'#1E1E30'},
  miniAvatar:{width:36,height:36,borderRadius:18,alignItems:'center',justifyContent:'center'},miniAvatarText:{color:'#FFF',fontSize:16,fontWeight:'800'},
  recipientLabel:{color:'#6B7280',fontSize:11},recipientName:{color:'#F9FAFB',fontSize:14,fontWeight:'700'},
  escrowBox:{backgroundColor:'#0A0A14',borderRadius:12,padding:14,marginBottom:16,borderWidth:1,borderColor:'#4C1D95'},
  escrowLabel:{color:'#6B7280',fontSize:11,fontWeight:'600',marginBottom:6,textTransform:'uppercase',letterSpacing:0.5},
  escrowAddress:{color:'#C4B5FD',fontSize:12,fontFamily:'monospace',lineHeight:18},
  infoBox:{backgroundColor:'#1C1532',borderRadius:12,padding:12,borderWidth:1,borderColor:'#4C1D95',marginBottom:20},infoText:{color:'#A78BFA',fontSize:13,lineHeight:18},
  magicCodeBox:{backgroundColor:'#0A0A14',borderRadius:12,padding:16,marginBottom:16,borderWidth:2,borderColor:'#C9A84C',alignItems:'center'},
  magicCodeLabel:{color:'#C9A84C',fontSize:11,fontWeight:'600',textTransform:'uppercase',letterSpacing:1,marginBottom:8},
  magicCode:{color:'#E8C454',fontSize:20,fontWeight:'800',fontFamily:'monospace',letterSpacing:2},
  shareBtn:{backgroundColor:'#1C1532',borderRadius:12,padding:14,alignItems:'center',marginBottom:16,borderWidth:1,borderColor:'#7C3AED'},shareBtnText:{color:'#C4B5FD',fontSize:15,fontWeight:'700'},
  warningBox:{backgroundColor:'#1C0A00',borderRadius:12,padding:12,borderWidth:1,borderColor:'#D97706',marginBottom:20},warningText:{color:'#F59E0B',fontSize:12,lineHeight:18},
  primaryBtn:{backgroundColor:'#7C3AED',borderRadius:12,padding:14,alignItems:'center',marginBottom:8},primaryBtnText:{color:'#FFF',fontSize:15,fontWeight:'700'},
  secondaryBtn:{padding:12,alignItems:'center'},secondaryBtnText:{color:'#6B7280',fontSize:14},
  claimInput:{backgroundColor:'#0A0A14',borderRadius:10,padding:14,color:'#F9FAFB',fontSize:15,borderWidth:1,borderColor:'#1E1E30',marginBottom:12,fontFamily:'monospace'},
  claimBtn:{backgroundColor:'#C9A84C',borderRadius:12,padding:14,alignItems:'center'},claimBtnText:{color:'#12082a',fontSize:15,fontWeight:'800'},
});
