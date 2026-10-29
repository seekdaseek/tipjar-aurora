import React, {useState} from 'react';
import {View,Text,TextInput,TouchableOpacity,StyleSheet,ScrollView,Alert,ActivityIndicator,KeyboardAvoidingView,Platform} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../App';
import {db} from '../../firebase';
import {ref,push} from 'firebase/database';
type Props = {navigation: NativeStackNavigationProp<RootStackParamList,'Register'>};
const CATEGORIES = ['Builder','Trader','NFT Artist','Streamer','Educator','DePIN','DeFi','Gaming','Other'];
export default function RegisterScreen({navigation}: Props) {
  const [name,setName]=useState('');
  const [handle,setHandle]=useState('');
  const [wallet,setWallet]=useState('');
  const [project,setProject]=useState('');
  const [category,setCategory]=useState('');
  const [loading,setLoading]=useState(false);
  const register = async () => {
    if(!name.trim()||!wallet.trim()||!category){Alert.alert('Missing info','Please fill in name, wallet and category.');return;}
    if(wallet.length<32){Alert.alert('Invalid wallet','Enter a valid Solana wallet address.');return;}
    setLoading(true);
    try {
      await push(ref(db,'creators'),{
        name:name.trim(),
        handle:handle.trim()||`@${name.trim().toLowerCase().replace(/\s/g,'')}`,
        wallet:wallet.trim(),
        project:project.trim(),
        category,
        createdAt:Date.now(),
      });
      Alert.alert('🎉 You\'re live!','Your tip jar is now visible to everyone.',[{text:'View it',onPress:()=>navigation.goBack()}]);
    } catch(e){Alert.alert('Error','Could not register. Check your connection.');}
    finally{setLoading(false);}
  };
  return (
    <SafeAreaView style={s.container} edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={{flex:1}}>
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          <View style={s.hero}>
            <Text style={s.heroEmoji}>⚡</Text>
            <Text style={s.heroTitle}>Add your tip jar</Text>
            <Text style={s.heroSub}>Get tips from anyone in the Solana ecosystem</Text>
          </View>
          <View style={s.form}>
            <View style={s.field}>
              <Text style={s.label}>Your name *</Text>
              <TextInput style={s.input} placeholder="e.g. Nimus" placeholderTextColor="#4B5563" value={name} onChangeText={setName}/>
            </View>
            <View style={s.field}>
              <Text style={s.label}>Handle</Text>
              <TextInput style={s.input} placeholder="@yourhandle" placeholderTextColor="#4B5563" value={handle} onChangeText={setHandle} autoCapitalize="none"/>
            </View>
            <View style={s.field}>
              <Text style={s.label}>Solana wallet address *</Text>
              <TextInput style={[s.input,{fontFamily:'monospace',fontSize:12}]} placeholder="Your SOL wallet address" placeholderTextColor="#4B5563" value={wallet} onChangeText={setWallet} autoCapitalize="none" autoCorrect={false}/>
            </View>
            <View style={s.field}>
              <Text style={s.label}>Project / what you build</Text>
              <TextInput style={s.input} placeholder="e.g. Solana Tip Jar dApp" placeholderTextColor="#4B5563" value={project} onChangeText={setProject}/>
            </View>
            <View style={s.field}>
              <Text style={s.label}>Category *</Text>
              <View style={s.catGrid}>
                {CATEGORIES.map(cat=>(
                  <TouchableOpacity key={cat} style={[s.catBtn,category===cat&&s.catBtnActive]} onPress={()=>setCategory(cat)}>
                    <Text style={[s.catBtnText,category===cat&&s.catBtnTextActive]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
          <TouchableOpacity style={[s.registerBtn,loading&&{opacity:0.6}]} onPress={register} disabled={loading}>
            {loading?<ActivityIndicator color="#FFF"/>:<Text style={s.registerBtnText}>⚡ Go live — add my tip jar</Text>}
          </TouchableOpacity>
          <Text style={s.disclaimer}>Tips go directly to your wallet. No fees taken by Tip Jar.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const s=StyleSheet.create({
  container:{flex:1,backgroundColor:'#0A0A14'},
  scroll:{padding:20,paddingBottom:40},
  hero:{alignItems:'center',marginBottom:28,marginTop:8},
  heroEmoji:{fontSize:48,marginBottom:8},
  heroTitle:{color:'#F9FAFB',fontSize:24,fontWeight:'800'},
  heroSub:{color:'#6B7280',fontSize:14,marginTop:4,textAlign:'center'},
  form:{gap:20},
  field:{gap:8},
  label:{color:'#9CA3AF',fontSize:13,fontWeight:'600',textTransform:'uppercase',letterSpacing:0.5},
  input:{backgroundColor:'#131320',borderRadius:10,padding:14,color:'#F9FAFB',fontSize:15,borderWidth:1,borderColor:'#1E1E30'},
  catGrid:{flexDirection:'row',flexWrap:'wrap',gap:8},
  catBtn:{backgroundColor:'#131320',borderRadius:8,paddingHorizontal:14,paddingVertical:8,borderWidth:1,borderColor:'#1E1E30'},
  catBtnActive:{backgroundColor:'#4C1D95',borderColor:'#7C3AED'},
  catBtnText:{color:'#6B7280',fontSize:13,fontWeight:'600'},
  catBtnTextActive:{color:'#C4B5FD'},
  registerBtn:{backgroundColor:'#7C3AED',borderRadius:14,padding:18,alignItems:'center',marginTop:28},
  registerBtnText:{color:'#FFF',fontSize:16,fontWeight:'800'},
  disclaimer:{color:'#4B5563',fontSize:12,textAlign:'center',marginTop:16},
});
