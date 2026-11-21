# SpawnFi router -> Supabase status push (no tunnel needed). RouterOS 7.13+ (uses :serialize).
# Reads netwatch (boards) + PPP secrets/active, sends them to rpc/spawnfi_push in chunks of 50.
# The router makes its own random token on first run (script "spawnfi-push-token"); the first push registers it.
# To reset a router's token: update spawnfi_reader_state set push_token_hash=null where router='<name>'.
/system script remove [find name=spawnfi-push]
/system script add name=spawnfi-push policy=read,write,test,policy source={
:local url "https://cviraqfhphhsonjmrtvu.supabase.co/rest/v1/rpc/spawnfi_push"
:local hdr "apikey: sb_publishable_6J1xIrlkpHf6jir4DtUh4g_xX7Fm9ln,Content-Type: application/json"
:local rtr [/system identity get name]
:if ([:len [/system script find name="spawnfi-push-token"]] = 0) do={
  /system script add name="spawnfi-push-token" source=[:rndstr length=40 from="abcdefghijkmnpqrstuvwxyz23456789"]
}
:local tok [/system script get [/system script find name="spawnfi-push-token"] source]
:local cyc ([/system clock get date] . " " . [/system clock get time])
:local send do={ /tool fetch url=$u mode=https http-method=post check-certificate=no output=none http-header-field=$h http-data=$d }
:local rows ({})
:local b
:foreach i in=[/tool netwatch find] do={
  :set ($rows->[:len $rows]) {"host"=[/tool netwatch get $i host];"status"=[/tool netwatch get $i status];"since"=[:tostr [/tool netwatch get $i since]];"comment"=[/tool netwatch get $i comment];"disabled"=[/tool netwatch get $i disabled]}
  :if ([:len $rows] >= 50) do={
    :set b {"p_token"=$tok;"p_router"=$rtr;"p_kind"="board";"p_cycle"=$cyc;"p_rows"=$rows;"p_final"=false}
    $send u=$url h=$hdr d=[:serialize to=json value=$b]
    :set rows ({})
  }
}
:set b {"p_token"=$tok;"p_router"=$rtr;"p_kind"="board";"p_cycle"=$cyc;"p_rows"=$rows;"p_final"=true}
$send u=$url h=$hdr d=[:serialize to=json value=$b]
:set rows ({})
:foreach i in=[/ppp secret find] do={
  :local nm [/ppp secret get $i name]
  :set ($rows->[:len $rows]) {"name"=$nm;"profile"=[/ppp secret get $i profile];"service"=[/ppp secret get $i service];"comment"=[/ppp secret get $i comment];"disabled"=[/ppp secret get $i disabled];"lastout"=[:tostr [/ppp secret get $i last-logged-out]];"online"=([:len [/ppp active find name=$nm]] > 0)}
  :if ([:len $rows] >= 50) do={
    :set b {"p_token"=$tok;"p_router"=$rtr;"p_kind"="ppp";"p_cycle"=$cyc;"p_rows"=$rows;"p_final"=false}
    $send u=$url h=$hdr d=[:serialize to=json value=$b]
    :set rows ({})
  }
}
:set b {"p_token"=$tok;"p_router"=$rtr;"p_kind"="ppp";"p_cycle"=$cyc;"p_rows"=$rows;"p_final"=true}
$send u=$url h=$hdr d=[:serialize to=json value=$b]
:log info "spawnfi-push done"
}
