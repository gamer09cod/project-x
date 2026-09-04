import {getApp} from '@react-native-firebase/app';
import {getAuth} from '@react-native-firebase/auth';
import {getFunctions} from '@react-native-firebase/functions';

/** Region must match backend setGlobalOptions. */
export const FUNCTIONS_REGION = 'us-central1';

export function appAuth() {
  return getAuth(getApp());
}

export function appFunctions() {
  return getFunctions(getApp(), FUNCTIONS_REGION);
}
