// src/screens/SuccessScreen.tsx
import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RouteProp} from '@react-navigation/native';
import {RootStackParamList} from '../../App';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Success'>;
  route: RouteProp<RootStackParamList, 'Success'>;
};

export default function SuccessScreen({navigation, route}: Props) {
  const {amount, creatorName} = route.params;
  return (
    <SafeAreaView style={s.container} edges={['bottom']}>
      <View style={s.inner}>
        <View style={s.circle}><Text style={s.emoji}>⚡</Text></View>
        <Text style={s.title}>Tip sent!</Text>
        <Text style={s.sub}>You tipped <Text style={s.hi}>◎ {amount}</Text> to <Text style={s.hi}>{creatorName}</Text></Text>
        <Text style={s.desc}>The transaction was approved in Phantom and sent directly on-chain. No middlemen, no platform fees.</Text>
        <TouchableOpacity style={s.btn} onPress={() => navigation.popToTop()}>
          <Text style={s.btnText}>Back to creators</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:{flex:1,backgroundColor:'#0F0F1A'},
  inner:{flex:1,padding:24,alignItems:'center',justifyContent:'center'},
  circle:{width:96,height:96,borderRadius:48,backgroundColor:'#4C1D95',alignItems:'center',justifyContent:'center',marginBottom:24,borderWidth:3,borderColor:'#7C3AED'},
  emoji:{fontSize:44},
  title:{color:'#F9FAFB',fontSize:32,fontWeight:'800',marginBottom:10},
  sub:{color:'#D1D5DB',fontSize:18,textAlign:'center',marginBottom:12},
  hi:{color:'#C4B5FD',fontWeight:'700'},
  desc:{color:'#6B7280',fontSize:14,textAlign:'center',lineHeight:20,marginBottom:32,paddingHorizontal:10},
  btn:{backgroundColor:'#7C3AED',borderRadius:14,padding:16,alignItems:'center',width:'100%'},
  btnText:{color:'#FFF',fontSize:16,fontWeight:'700'},
});
