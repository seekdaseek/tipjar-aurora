import React, {useState, useEffect} from 'react';
import {View,Text,FlatList,TouchableOpacity,StyleSheet,TextInput,StatusBar,ActivityIndicator} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../App';
import {db} from '../../firebase';
import {ref, onValue} from 'firebase/database';
type Props = {navigation: NativeStackNavigationProp<RootStackParamList,'Home'>};
const COLORS = ['#7C3AED','#0891B2','#DB2777','#059669','#D97706','#DC2626'];
export default function HomeScreen({navigation}: Props) {
  const [search,setSearch]=useState('');
  const [creators,setCreators]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    const unsub=onValue(ref(db,'creators'),snapshot=>{
      const data=snapshot.val();
      if(data){setCreators(Object.entries(data).map(([id,val]:any)=>({id,...val})).reverse());}
      else{setCreators([]);}
      setLoading(false);
    });
    return ()=>unsub();
  },[]);
  const filtered=creators.filter(c=>c.name?.toLowerCase().includes(search.toLowerCase())||c.handle?.toLowerCase().includes(search.toLowerCase()));
  return (
    <SafeAreaView style={s.container} edges={['bottom']}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A14"/>
      <View style={s.header}>
        <View style={s.headerTop}>
          <View><Text style={s.title}>⚡ Tip Jar</Text><Text style={s.subtitle}>Support Solana builders on-chain</Text></View>
          <TouchableOpacity style={s.addBtn} onPress={()=>navigation.navigate('Register')}>
            <Text style={s.addBtnText}>+ Join</Text>
          </TouchableOpacity>
        </View>
        <TextInput style={s.search} placeholder="Search creators..." placeholderTextColor="#4B5563" value={search} onChangeText={setSearch}/>
      </View>
      {loading?(<View style={s.center}><ActivityIndicator color="#7C3AED" size="large"/><Text style={s.loadingText}>Loading...</Text></View>)
      :filtered.length===0?(<View style={s.center}><Text style={{fontSize:48}}>⚡</Text><Text style={s.emptyText}>No creators yet</Text><TouchableOpacity style={s.joinBtn} onPress={()=>navigation.navigate('Register')}><Text style={s.joinBtnText}>Add your tip jar</Text></TouchableOpacity></View>)
      :(<FlatList data={filtered} keyExtractor={i=>i.id} contentContainerStyle={s.list} ItemSeparatorComponent={()=><View style={{height:10}}/>}
          renderItem={({item,index})=>{
            const color=COLORS[index%COLORS.length];
            return(<TouchableOpacity style={s.card} activeOpacity={0.85} onPress={()=>navigation.navigate('Tip',{name:item.name,wallet:item.wallet,color,category:item.category})}>
              <View style={[s.avatar,{backgroundColor:color}]}><Text style={s.avatarText}>{item.name?.[0]?.toUpperCase()}</Text></View>
              <View style={s.cardBody}><Text style={s.cardName}>{item.name}</Text><Text style={s.cardHandle}>{item.handle}</Text>
                <View style={[s.badge,{backgroundColor:color+'22'}]}><Text style={[s.badgeText,{color}]}>{item.category}</Text></View>
              </View>
              <View style={s.tipChip}><Text style={s.tipChipText}>Tip ⚡</Text></View>
            </TouchableOpacity>);
          }}/>)}

      <TouchableOpacity
        style={s.devBtn}
        onPress={()=>navigation.navigate('Tip',{name:'Nimus',wallet:'4a8o45skRPcyjAdyR8yES215Swvh8uTpZD6KLarhxCJ7',color:'#C9A84C',category:'Builder'})}>
        <Text style={s.devBtnText}>⚡ Tip the developer</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}
const s=StyleSheet.create({
  container:{flex:1,backgroundColor:'#0A0A14'},
  header:{paddingHorizontal:20,paddingTop:16,paddingBottom:14,borderBottomWidth:1,borderBottomColor:'#16162A'},
  headerTop:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:14},
  title:{color:'#F9FAFB',fontSize:26,fontWeight:'800'},
  subtitle:{color:'#4B5563',fontSize:12,marginTop:2},
  addBtn:{backgroundColor:'#7C3AED',borderRadius:10,paddingHorizontal:16,paddingVertical:8},
  addBtnText:{color:'#FFF',fontSize:14,fontWeight:'700'},
  search:{backgroundColor:'#131320',borderRadius:10,paddingHorizontal:14,paddingVertical:10,color:'#F9FAFB',fontSize:14,borderWidth:1,borderColor:'#1E1E30'},
  center:{flex:1,alignItems:'center',justifyContent:'center',gap:8},
  loadingText:{color:'#6B7280',fontSize:14,marginTop:8},
  emptyText:{color:'#F9FAFB',fontSize:18,fontWeight:'700'},
  joinBtn:{marginTop:16,backgroundColor:'#7C3AED',borderRadius:12,paddingHorizontal:24,paddingVertical:12},
  joinBtnText:{color:'#FFF',fontSize:15,fontWeight:'700'},
  list:{padding:16},
  card:{backgroundColor:'#131320',borderRadius:14,padding:14,flexDirection:'row',alignItems:'center',borderWidth:1,borderColor:'#1E1E30'},
  avatar:{width:48,height:48,borderRadius:24,alignItems:'center',justifyContent:'center',marginRight:12},
  avatarText:{color:'#FFF',fontSize:20,fontWeight:'800'},
  cardBody:{flex:1},
  cardName:{color:'#F9FAFB',fontSize:15,fontWeight:'700'},
  cardHandle:{color:'#6B7280',fontSize:12,marginTop:1},
  badge:{marginTop:6,borderRadius:6,paddingHorizontal:8,paddingVertical:3,alignSelf:'flex-start'},
  badgeText:{fontSize:11,fontWeight:'600'},
  tipChip:{backgroundColor:'#7C3AED',borderRadius:8,paddingHorizontal:12,paddingVertical:6,marginLeft:8},
  tipChipText:{color:'#FFF',fontSize:12,fontWeight:'700'},
  devBtn:{position:'absolute',bottom:20,alignSelf:'center',backgroundColor:'#1a1200',borderRadius:20,paddingHorizontal:20,paddingVertical:10,borderWidth:1.5,borderColor:'#C9A84C',flexDirection:'row',alignItems:'center'},
  devBtnText:{color:'#C9A84C',fontSize:13,fontWeight:'700'},
});
