import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import HomeScreen from './src/screens/HomeScreen';
import TipScreen from './src/screens/TipScreen';
import SuccessScreen from './src/screens/SuccessScreen';
import RegisterScreen from './src/screens/RegisterScreen';
export type RootStackParamList = {
  Home: undefined;
  Tip: {name:string;wallet:string;color:string;category:string};
  Success: {amount:string;creatorName:string};
  Register: undefined;
};
const Stack = createNativeStackNavigator<RootStackParamList>();
export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{headerStyle:{backgroundColor:'#0A0A14'},headerTintColor:'#C4B5FD',headerTitleStyle:{fontWeight:'700'},contentStyle:{backgroundColor:'#0A0A14'}}}>
          <Stack.Screen name="Home" component={HomeScreen} options={{headerShown:false}}/>
          <Stack.Screen name="Tip" component={TipScreen} options={{title:'Send a Tip'}}/>
          <Stack.Screen name="Success" component={SuccessScreen} options={{title:'🎉 Tip Sent!',headerBackVisible:false}}/>
          <Stack.Screen name="Register" component={RegisterScreen} options={{title:'Add Your Tip Jar'}}/>
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
