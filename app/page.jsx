import Ahoy from './ahoy';
export default async function Page({ searchParams }) {
 const params=await searchParams;
 const allowed=['dashboard','campaigns','analytics','activity','accounts','setup','settings','guide','login','privacy','terms','deletion','review'];
 return <Ahoy initialView={allowed.includes(params.view)?params.view:'home'}/>;
}
